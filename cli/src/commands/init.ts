import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from 'zouroboros-core';
import { runDoctor } from '../utils/doctor.js';

export const initCommand = new Command('init')
  .description('Initialize Zouroboros configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--skip-doctor', 'Skip health check after initialization')
  .option('--skip-ollama', 'Skip Ollama installation')
  .action(async (options) => {
    console.log(chalk.cyan('\n🐍⭕ Initializing Zouroboros...\n'));

    const configDir = join(homedir(), '.zouroboros');
    const configPath = join(configDir, 'config.json');

    // Check if already initialized
    if (existsSync(configPath) && !options.force) {
      console.log(chalk.yellow('⚠️  Zouroboros is already initialized.'));
      console.log(chalk.gray(`   Config: ${configPath}`));
      console.log(chalk.gray('\n   Use --force to reinitialize.\n'));
      return;
    }

    // Create config directory
    mkdirSync(configDir, { recursive: true });

    // Create default configuration
    const config = {
      ...DEFAULT_CONFIG,
      initializedAt: new Date().toISOString(),
    };

    saveConfig(config, configPath);

    console.log(chalk.green('✅ Configuration created'));
    console.log(chalk.gray(`   ${configPath}\n`));

    // Create workspace directories
    const workspaceDirs = [
      join(configDir, 'logs'),
      join(configDir, 'seeds'),
      join(configDir, 'results'),
    ];

    for (const dir of workspaceDirs) {
      mkdirSync(dir, { recursive: true });
    }

    console.log(chalk.green('✅ Workspace directories created'));
    console.log(chalk.gray(`   ${configDir}/{logs,seeds,results}\n`));

    // Initialize memory database
    console.log(chalk.cyan('💾 Initializing memory database...'));
    try {
      const dbPath = config.memory.dbPath;
      const dbDir = join(dbPath, '..');
      mkdirSync(dbDir, { recursive: true });

      // Use sqlite3 CLI to create the schema (avoids needing bun:sqlite at install time)
      const schemaSql = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  persona TEXT,
  entity TEXT NOT NULL,
  key TEXT,
  value TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT DEFAULT 'fact' CHECK(category IN ('preference', 'fact', 'decision', 'convention', 'other', 'reference', 'project')),
  decay_class TEXT DEFAULT 'medium' CHECK(decay_class IN ('permanent', 'long', 'medium', 'short')),
  importance REAL DEFAULT 1.0,
  source TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  expires_at INTEGER,
  last_accessed INTEGER DEFAULT (strftime('%s', 'now')),
  confidence REAL DEFAULT 1.0,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS fact_embeddings (
  fact_id TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  model TEXT DEFAULT 'nomic-embed-text',
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'failure', 'resolved', 'ongoing')),
  happened_at INTEGER NOT NULL,
  duration_ms INTEGER,
  procedure_id TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS episode_entities (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  PRIMARY KEY (episode_id, entity)
);

CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  steps TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  evolved_from TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS open_loops (
  id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  entity TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  priority INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS continuation_context (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  last_summary TEXT NOT NULL,
  open_loop_ids TEXT,
  entity_stack TEXT,
  last_agent TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS cognitive_profiles (
  entity TEXT PRIMARY KEY,
  traits TEXT,
  preferences TEXT,
  interaction_count INTEGER DEFAULT 0,
  last_interaction INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_facts_entity_key ON facts(entity, key);
CREATE INDEX IF NOT EXISTS idx_facts_decay ON facts(decay_class, expires_at);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_episodes_happened ON episodes(happened_at);
CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
CREATE INDEX IF NOT EXISTS idx_episode_entities ON episode_entities(entity);
CREATE INDEX IF NOT EXISTS idx_open_loops_entity ON open_loops(entity, status);
`;

      execSync(`sqlite3 "${dbPath}" <<'SCHEMA'\n${schemaSql}\nSCHEMA`, {
        shell: '/bin/bash',
        stdio: 'pipe',
      });

      console.log(chalk.green('✅ Memory database initialized'));
      console.log(chalk.gray(`   ${dbPath}\n`));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Memory database initialization failed — will be created on first use'));
      console.log(chalk.gray(`   ${error instanceof Error ? error.message : String(error)}\n`));
    }

    // Install Ollama if not present
    if (!options.skipOllama) {
      console.log(chalk.cyan('🦙 Checking Ollama...'));

      let ollamaAvailable = false;
      try {
        execSync('command -v ollama', { stdio: 'pipe' });
        ollamaAvailable = true;
        console.log(chalk.green('✅ Ollama already installed'));
      } catch {
        console.log(chalk.gray('   Ollama not found — installing...'));
        try {
          execSync('curl -fsSL https://ollama.com/install.sh | sh', {
            stdio: 'inherit',
            timeout: 120000,
          });
          ollamaAvailable = true;
          console.log(chalk.green('✅ Ollama installed'));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Ollama installation failed — vector search will be limited'));
          console.log(chalk.gray('   Install manually: https://ollama.com/download\n'));
        }
      }

      // Pull the embedding model if Ollama is available
      if (ollamaAvailable) {
        console.log(chalk.gray('   Pulling embedding model (nomic-embed-text)...'));
        try {
          // Ensure ollama is serving
          try {
            execSync('curl -sf http://localhost:11434/api/tags > /dev/null', { timeout: 3000 });
          } catch {
            // Start ollama serve in background
            execSync('nohup ollama serve > /dev/null 2>&1 &', { shell: '/bin/bash' });
            // Wait briefly for it to start
            execSync('sleep 3');
          }

          execSync('ollama pull nomic-embed-text', {
            stdio: 'inherit',
            timeout: 300000, // 5 min for model download
          });
          console.log(chalk.green('✅ Embedding model ready\n'));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not pull embedding model — run manually: ollama pull nomic-embed-text\n'));
        }
      }
    } else {
      console.log(chalk.gray('⏭️  Skipping Ollama installation (--skip-ollama)\n'));
    }

    // Run doctor unless skipped
    if (!options.skipDoctor) {
      console.log(chalk.cyan('🔍 Running health check...\n'));
      const healthy = await runDoctor();

      if (healthy) {
        console.log(chalk.green('\n✅ Zouroboros is ready to use!\n'));
        console.log('Next steps:');
        console.log(chalk.yellow('  zouroboros doctor') + chalk.gray('     - Check system health'));
        console.log(chalk.yellow('  zouroboros --help') + chalk.gray('     - See all commands'));
        console.log(chalk.yellow('  zouroboros tui') + chalk.gray('        - Launch dashboard\n'));
      } else {
        console.log(chalk.yellow('\n⚠️  Some components need attention.\n'));
        console.log('Run ' + chalk.yellow('zouroboros doctor') + ' for details.\n');
      }
    } else {
      console.log(chalk.green('\n✅ Initialization complete!\n'));
    }
  });
