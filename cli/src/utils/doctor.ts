/**
 * Doctor utility - Health check for Zouroboros components
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { loadConfig, saveConfig, DEFAULT_CONFIG, DEFAULT_MEMORY_DB_PATH } from 'zouroboros-core';

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  fixable?: boolean;
  fix?: () => boolean;
}

export async function runDoctor(options: { fix?: boolean } = {}): Promise<boolean> {
  const checks: CheckResult[] = [];

  // Check 1: Configuration exists
  const configPath = join(homedir(), '.zouroboros', 'config.json');
  if (existsSync(configPath)) {
    checks.push({ name: 'Configuration', status: 'ok', message: `Found at ${configPath}` });
  } else {
    checks.push({
      name: 'Configuration',
      status: 'error',
      message: 'Not found. Run: zouroboros init',
      fixable: true,
      fix: () => {
        try {
          const configDir = join(homedir(), '.zouroboros');
          mkdirSync(configDir, { recursive: true });
          const config = { ...DEFAULT_CONFIG, initializedAt: new Date().toISOString() };
          saveConfig(config, configPath);

          // Create workspace directories
          for (const sub of ['logs', 'seeds', 'results']) {
            mkdirSync(join(configDir, sub), { recursive: true });
          }
          return true;
        } catch {
          return false;
        }
      },
    });
  }

  // Check 2: Memory database
  const memoryDb = DEFAULT_MEMORY_DB_PATH;
  if (existsSync(memoryDb)) {
    try {
      const result = execSync(`sqlite3 "${memoryDb}" "SELECT COUNT(*) FROM facts;"`, { encoding: 'utf-8' });
      const count = parseInt(result.trim());
      checks.push({ name: 'Memory Database', status: 'ok', message: `${count} facts stored` });
    } catch {
      checks.push({ name: 'Memory Database', status: 'warning', message: 'Exists but schema may need migration' });
    }
  } else {
    checks.push({
      name: 'Memory Database',
      status: 'warning',
      message: 'Not initialized. Will be created on first use.',
      fixable: true,
      fix: () => {
        try {
          const dbDir = dirname(memoryDb);
          mkdirSync(dbDir, { recursive: true });

          const schemaSql = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, persona TEXT, entity TEXT NOT NULL, key TEXT, value TEXT NOT NULL, text TEXT NOT NULL, category TEXT DEFAULT 'fact', decay_class TEXT DEFAULT 'medium', importance REAL DEFAULT 1.0, source TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), expires_at INTEGER, last_accessed INTEGER DEFAULT (strftime('%s','now')), confidence REAL DEFAULT 1.0, metadata TEXT);
CREATE TABLE IF NOT EXISTS fact_embeddings (fact_id TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE, embedding BLOB NOT NULL, model TEXT DEFAULT 'nomic-embed-text', created_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, summary TEXT NOT NULL, outcome TEXT NOT NULL, happened_at INTEGER NOT NULL, duration_ms INTEGER, procedure_id TEXT, metadata TEXT, created_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS episode_entities (episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, entity TEXT NOT NULL, PRIMARY KEY (episode_id, entity));
CREATE TABLE IF NOT EXISTS procedures (id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER DEFAULT 1, steps TEXT NOT NULL, success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0, evolved_from TEXT, created_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS open_loops (id TEXT PRIMARY KEY, summary TEXT NOT NULL, entity TEXT NOT NULL, status TEXT DEFAULT 'open', priority INTEGER DEFAULT 1, created_at INTEGER DEFAULT (strftime('%s','now')), resolved_at INTEGER);
CREATE TABLE IF NOT EXISTS continuation_context (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, last_summary TEXT NOT NULL, open_loop_ids TEXT, entity_stack TEXT, last_agent TEXT, updated_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS cognitive_profiles (entity TEXT PRIMARY KEY, traits TEXT, preferences TEXT, interaction_count INTEGER DEFAULT 0, last_interaction INTEGER, created_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER DEFAULT (strftime('%s','now')));
CREATE INDEX IF NOT EXISTS idx_facts_entity_key ON facts(entity, key);
CREATE INDEX IF NOT EXISTS idx_facts_decay ON facts(decay_class, expires_at);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_episodes_happened ON episodes(happened_at);
CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
CREATE INDEX IF NOT EXISTS idx_episode_entities ON episode_entities(entity);
CREATE INDEX IF NOT EXISTS idx_open_loops_entity ON open_loops(entity, status);
`;
          execSync(`sqlite3 "${memoryDb}" "${schemaSql.replace(/"/g, '\\"')}"`, {
            shell: '/bin/bash',
            stdio: 'pipe',
          });
          return true;
        } catch {
          return false;
        }
      },
    });
  }

  // Check 3: Ollama (for embeddings)
  let ollamaRunning = false;
  try {
    execSync('curl -sf http://localhost:11434/api/tags > /dev/null', { timeout: 5000 });
    ollamaRunning = true;
    checks.push({ name: 'Ollama', status: 'ok', message: 'Running on localhost:11434' });
  } catch {
    // Check if ollama is installed but not running
    let ollamaInstalled = false;
    try {
      execSync('command -v ollama', { stdio: 'pipe' });
      ollamaInstalled = true;
    } catch {}

    checks.push({
      name: 'Ollama',
      status: 'warning',
      message: ollamaInstalled
        ? 'Installed but not running. Start with: ollama serve'
        : 'Not installed. Vector search will be limited.',
      fixable: true,
      fix: () => {
        try {
          if (!ollamaInstalled) {
            console.log(chalk.gray('     Installing Ollama...'));
            execSync('curl -fsSL https://ollama.com/install.sh | sh', {
              stdio: 'inherit',
              timeout: 120000,
            });
          }

          // Start ollama serve in background
          console.log(chalk.gray('     Starting Ollama...'));
          spawnSync('sh', ['-c', 'nohup ollama serve > /dev/null 2>&1 &'], { stdio: 'ignore' });
          execSync('sleep 3');

          // Pull embedding model
          console.log(chalk.gray('     Pulling nomic-embed-text model...'));
          execSync('ollama pull nomic-embed-text', {
            stdio: 'inherit',
            timeout: 300000,
          });

          return true;
        } catch {
          return false;
        }
      },
    });
  }

  // Check 4: Swarm executors
  const executorInfo: Record<string, { binary: string; install: string }> = {
    'claude-code': { binary: 'claude', install: 'npm install -g @anthropic-ai/claude-code' },
    'codex': { binary: 'codex', install: 'npm install -g @openai/codex' },
    'gemini': { binary: 'gemini', install: 'npm install -g @google/gemini-cli' },
    'hermes': { binary: 'hermes', install: 'pip install hermes-agent && hermes setup' },
  };
  const executors = Object.keys(executorInfo);
  const availableExecutors: string[] = [];
  const missingExecutors: string[] = [];

  for (const executor of executors) {
    const { binary } = executorInfo[executor];
    try {
      execSync(`command -v ${binary} > /dev/null 2>&1`);
      availableExecutors.push(executor);
    } catch {
      missingExecutors.push(executor);
    }
  }

  if (availableExecutors.length === executors.length) {
    checks.push({
      name: 'Swarm Executors',
      status: 'ok',
      message: `${availableExecutors.length}/${executors.length} available: ${availableExecutors.join(', ')}`
    });
  } else if (availableExecutors.length > 0) {
    checks.push({
      name: 'Swarm Executors',
      status: 'warning',
      message: `${availableExecutors.length}/${executors.length} available. Missing: ${missingExecutors.join(', ')}`,
      fixable: true,
      fix: () => {
        let allFixed = true;
        for (const executor of missingExecutors) {
          const info = executorInfo[executor];
          try {
            console.log(chalk.gray(`     Installing ${executor} (${info.install})...`));
            execSync(info.install, { stdio: 'inherit', timeout: 120000 });
          } catch {
            console.log(chalk.yellow(`     ⚠ Could not auto-install ${executor}. Run manually: ${info.install}`));
            allFixed = false;
          }
        }
        return allFixed;
      }
    });
  } else {
    checks.push({
      name: 'Swarm Executors',
      status: 'error',
      message: 'None found. Install at least one executor.',
      fixable: true,
      fix: () => {
        const info = executorInfo['claude-code'];
        try {
          console.log(chalk.gray(`     Installing claude-code (${info.install})...`));
          execSync(info.install, { stdio: 'inherit', timeout: 120000 });
          return true;
        } catch {
          console.log(chalk.yellow(`     ⚠ Could not auto-install. Run manually: ${info.install}`));
          return false;
        }
      }
    });
  }

  // Check 5: Git
  try {
    execSync('command -v git > /dev/null 2>&1');
    checks.push({ name: 'Git', status: 'ok', message: 'Available' });
  } catch {
    checks.push({ name: 'Git', status: 'error', message: 'Not found. Required for autoloop.' });
  }

  // Check 6: Scheduled Agents (from agents/manifest.json)
  // Only check if running on Zo platform (token available)
  const zoToken = process.env.ZO_CLIENT_IDENTITY_TOKEN;
  if (zoToken) {
    const monorepoRoot = join(__dirname, '..', '..', '..');
    const manifestPath = join(monorepoRoot, 'agents', 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const agentEntries = Object.entries(manifest.agents || {}) as [string, { zo_id: string; title: string; schedule: { rrule: string }; instruction: string; persona?: string | null; model?: string }][];
        let registered = 0;
        let missing = 0;
        const missingNames: string[] = [];
        const missingSpecs: typeof agentEntries = [];

        for (const [slug, spec] of agentEntries) {
          try {
            const result = execSync(
              `curl -sf -H "Authorization: Bearer ${zoToken}" https://api.zo.computer/zo/agents/${spec.zo_id}`,
              { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            const agent = JSON.parse(result);
            if (agent && (agent.id || agent.agent_id)) {
              registered++;
            } else {
              missing++;
              missingNames.push(spec.title);
              missingSpecs.push([slug, spec]);
            }
          } catch {
            missing++;
            missingNames.push(spec.title);
            missingSpecs.push([slug, spec]);
          }
        }

        if (missing === 0) {
          checks.push({
            name: 'Scheduled Agents',
            status: 'ok',
            message: `${registered}/${agentEntries.length} registered on Zo platform`
          });
        } else {
          checks.push({
            name: 'Scheduled Agents',
            status: 'warning',
            message: `${registered}/${agentEntries.length} found. Run in Zo chat: "Create all Zouroboros agents from agents/manifest.json"`,
          });
        }
      } catch {
        checks.push({
          name: 'Scheduled Agents',
          status: 'warning',
          message: 'Could not parse agents/manifest.json'
        });
      }
    } else {
      checks.push({
        name: 'Scheduled Agents',
        status: 'warning',
        message: 'agents/manifest.json not found — agent verification skipped'
      });
    }
  }

  // Print results
  console.log('Component Status:');
  console.log('─'.repeat(60));

  for (const check of checks) {
    const icon = check.status === 'ok' ? chalk.green('✓') :
                 check.status === 'warning' ? chalk.yellow('⚠') : chalk.red('✗');
    const name = chalk.bold(check.name.padEnd(20));
    const message = check.status === 'error' ? chalk.red(check.message) :
                    check.status === 'warning' ? chalk.yellow(check.message) :
                    chalk.gray(check.message);

    console.log(`${icon} ${name} ${message}`);
  }

  // Attempt fixes if requested
  if (options.fix) {
    const fixable = checks.filter(c => c.fixable && c.status !== 'ok' && c.fix);
    if (fixable.length > 0) {
      console.log(chalk.cyan('\n🔧 Attempting fixes...\n'));

      for (const check of fixable) {
        process.stdout.write(`   Fixing ${check.name}... `);
        const success = check.fix!();
        if (success) {
          console.log(chalk.green('✅ Fixed'));
        } else {
          console.log(chalk.red('❌ Failed'));
        }
      }

      // Re-run health check to show updated status
      console.log(chalk.cyan('\n🔄 Re-checking...\n'));
      return runDoctor({ fix: false });
    } else {
      console.log(chalk.gray('\nNo fixable issues found.'));
    }
  }

  const hasErrors = checks.some(c => c.status === 'error');
  const hasWarnings = checks.some(c => c.status === 'warning');

  if (hasErrors) {
    console.log(chalk.red('\n⚠  Some issues found'));
    if (checks.some(c => c.fixable && c.status !== 'ok')) {
      console.log(chalk.gray('   Run ' + chalk.yellow('zouroboros doctor --fix') + ' to auto-repair\n'));
    }
  } else if (hasWarnings) {
    console.log(chalk.yellow('\n⚠  Some issues found'));
    if (checks.some(c => c.fixable && c.status !== 'ok')) {
      console.log(chalk.gray('   Run ' + chalk.yellow('zouroboros doctor --fix') + ' to auto-repair\n'));
    }
  } else {
    console.log(chalk.green('\n✅ All systems healthy\n'));
  }

  return !hasErrors;
}
