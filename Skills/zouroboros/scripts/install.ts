#!/usr/bin/env bun
/**
 * Zouroboros Installer — sets up prerequisites on a fresh Zo Computer
 *
 * Usage: bun install.ts [--skip-ollama] [--skip-deps] [--help]
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "skip-ollama": { type: "boolean" },
    "skip-deps": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (values.help) {
  console.log(`
zouroboros install — set up prerequisites on a fresh Zo Computer

USAGE:
  bun install.ts [options]

OPTIONS:
  --skip-ollama   Skip Ollama installation and model pull
  --skip-deps     Skip npm dependency installation
  --help, -h      Show this help

WHAT IT DOES:
  1. Installs npm dependencies (MCP SDK) if needed
  2. Creates memory database with schema
  3. Installs Ollama + pulls embedding model (nomic-embed-text)
  4. Runs health check
`);
  process.exit(0);
}

const WORKSPACE = process.env.ZO_WORKSPACE || "/home/workspace";
const SKILL_DIR = join(WORKSPACE, "Skills/zouroboros");
const DB_DIR = join(WORKSPACE, ".zo/memory");
const DB_PATH = join(DB_DIR, "shared-facts.db");

function run(cmd: string, opts: { cwd?: string; timeout?: number } = {}) {
  try {
    return execSync(cmd, {
      cwd: opts.cwd || WORKSPACE,
      timeout: opts.timeout || 60000,
      stdio: "inherit",
    });
  } catch {
    return null;
  }
}

function runQuiet(cmd: string) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

console.log("\n🐍⭕ Zouroboros Installer");
console.log("========================\n");

// Step 1: Install npm dependencies for MCP servers
if (!values["skip-deps"]) {
  console.log("📦 Installing dependencies...");
  const scriptsDir = join(SKILL_DIR, "scripts");
  if (existsSync(join(scriptsDir, "package.json"))) {
    run("bun install", { cwd: scriptsDir });
    // Also install in sub-skill scripts dirs that need MCP SDK
    for (const sub of ["skills/memory/scripts", "skills/swarm/scripts", "skills/workflow/scripts/autoloop"]) {
      const subDir = join(SKILL_DIR, sub);
      if (existsSync(subDir)) {
        // Symlink node_modules from root scripts dir
        const nmLink = join(subDir, "node_modules");
        if (!existsSync(nmLink)) {
          try {
            execSync(`ln -sf "${join(scriptsDir, "node_modules")}" "${nmLink}"`, { stdio: "pipe" });
          } catch {}
        }
      }
    }
    console.log("✅ Dependencies installed\n");
  }
}

// Step 2: Create memory database
console.log("💾 Setting up memory database...");
mkdirSync(DB_DIR, { recursive: true });

if (!existsSync(DB_PATH)) {
  const schema = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, persona TEXT, entity TEXT NOT NULL, key TEXT,
  value TEXT NOT NULL, text TEXT NOT NULL,
  category TEXT DEFAULT 'fact' CHECK(category IN ('preference','fact','decision','convention','other','reference','project')),
  decay_class TEXT DEFAULT 'medium' CHECK(decay_class IN ('permanent','long','medium','short')),
  importance REAL DEFAULT 1.0, source TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  expires_at INTEGER, last_accessed INTEGER DEFAULT (strftime('%s','now')),
  confidence REAL DEFAULT 1.0, metadata TEXT
);
CREATE TABLE IF NOT EXISTS fact_embeddings (
  fact_id TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL, model TEXT DEFAULT 'nomic-embed-text',
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY, summary TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','resolved','ongoing')),
  happened_at INTEGER NOT NULL, duration_ms INTEGER, procedure_id TEXT,
  metadata TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS episode_entities (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  entity TEXT NOT NULL, PRIMARY KEY (episode_id, entity)
);
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER DEFAULT 1,
  steps TEXT NOT NULL, success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0,
  evolved_from TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS open_loops (
  id TEXT PRIMARY KEY, summary TEXT NOT NULL, entity TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved')),
  priority INTEGER DEFAULT 1, created_at INTEGER DEFAULT (strftime('%s','now')), resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS continuation_context (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, last_summary TEXT NOT NULL,
  open_loop_ids TEXT, entity_stack TEXT, last_agent TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cognitive_profiles (
  entity TEXT PRIMARY KEY, traits TEXT, preferences TEXT,
  interaction_count INTEGER DEFAULT 0, last_interaction INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fact_links (
  source_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  relation TEXT NOT NULL, weight REAL DEFAULT 1.0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (source_id, target_id, relation)
);
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_facts_entity_key ON facts(entity, key);
CREATE INDEX IF NOT EXISTS idx_facts_decay ON facts(decay_class, expires_at);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_episodes_happened ON episodes(happened_at);
CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
CREATE INDEX IF NOT EXISTS idx_episode_entities ON episode_entities(entity);
CREATE INDEX IF NOT EXISTS idx_open_loops_entity ON open_loops(entity, status);
CREATE INDEX IF NOT EXISTS idx_fact_links_source ON fact_links(source_id);
CREATE INDEX IF NOT EXISTS idx_fact_links_target ON fact_links(target_id);
`;
  try {
    execSync(`sqlite3 "${DB_PATH}" <<'SCHEMA'\n${schema}\nSCHEMA`, { shell: "/bin/bash", stdio: "pipe" });
    console.log(`✅ Memory database created at ${DB_PATH}\n`);
  } catch (e) {
    console.log("⚠️  Database creation failed — will be created on first use\n");
  }
} else {
  console.log(`✅ Memory database already exists at ${DB_PATH}\n`);
}

// Step 3: Ollama + embedding model
if (!values["skip-ollama"]) {
  console.log("🦙 Checking Ollama...");
  const hasOllama = runQuiet("command -v ollama");

  if (!hasOllama) {
    console.log("   Installing Ollama...");
    run("curl -fsSL https://ollama.com/install.sh | sh", { timeout: 120000 });
  }

  // Ensure ollama is serving
  const ollamaUp = runQuiet("curl -sf http://localhost:11434/api/tags");
  if (!ollamaUp) {
    run("nohup ollama serve > /dev/null 2>&1 &");
    run("sleep 3");
  }

  // Pull embedding model
  console.log("   Pulling nomic-embed-text...");
  run("ollama pull nomic-embed-text", { timeout: 300000 });

  // Pull classifier model for memory gate
  console.log("   Pulling qwen2.5:1.5b...");
  run("ollama pull qwen2.5:1.5b", { timeout: 300000 });

  console.log("✅ Ollama ready\n");
} else {
  console.log("⏭️  Skipping Ollama\n");
}

// Step 4: Health check
console.log("🔍 Running health check...");
const doctorScript = join(SKILL_DIR, "scripts/doctor.ts");
if (existsSync(doctorScript)) {
  run(`bun "${doctorScript}"`);
} else {
  // Quick inline check
  const checks = [
    { name: "Bun", cmd: "bun --version" },
    { name: "SQLite3", cmd: "sqlite3 --version" },
    { name: "Ollama", cmd: "ollama --version" },
    { name: "Memory DB", cmd: `test -f "${DB_PATH}"` },
  ];

  for (const c of checks) {
    const ok = runQuiet(c.cmd);
    console.log(`  ${ok !== null ? "✅" : "⚠️ "} ${c.name}`);
  }
}

console.log(`
🎉 Zouroboros installed!

Quick start:
  bun Skills/zouroboros/skills/selfheal/scripts/introspect.ts --verbose
  bun Skills/zouroboros/skills/memory/scripts/memory.ts search "query"
  bun Skills/zouroboros/scripts/doctor.ts
`);
