#!/usr/bin/env bun
/**
 * seed-rag-config.ts
 * Initializes memory schema extensions + seeds configs for all 5 RAG areas.
 */

import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DB = "/home/workspace/.zo/memory/shared-facts.db";
const CONFIG_DB = resolve(__dirname, "../data/rag-config.db");

// ── ensure output dirs ──────────────────────────────────────────────
const dataDir = resolve(__dirname, "../data");
const docsDir = resolve(__dirname, "../docs");
const testsDir = resolve(__dirname, "../tests");

 Bun.write(resolve(dataDir, ".gitkeep"), "");
 Bun.write(resolve(docsDir, ".gitkeep"), "");
 Bun.write(resolve(testsDir, ".gitkeep"), "");

// ── schema extensions ───────────────────────────────────────────────
function seedSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS rag_configs (
      id          TEXT PRIMARY KEY,
      area        TEXT NOT NULL,          -- swarm| vault| autoloop| eval| persona
      description TEXT,
      retrieval_signal TEXT,              -- what to retrieve
      fusion_weight REAL DEFAULT 0.5,     -- RRF or weighted fusion weight
      top_k       INTEGER DEFAULT 5,
      enabled     INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rag_evaluation (
      id          TEXT PRIMARY KEY,
      area        TEXT NOT NULL,
      metric      TEXT NOT NULL,         -- precision| recall| latency| coverage
      value       REAL NOT NULL,
      sample_size INTEGER DEFAULT 0,
      recorded_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rag_audit_log (
      id          TEXT PRIMARY KEY,
      area        TEXT NOT NULL,
      query       TEXT NOT NULL,
      hits        INTEGER DEFAULT 0,
      latency_ms  INTEGER DEFAULT 0,
      judged_useful INTEGER DEFAULT 0,  -- human feedback
      recorded_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log("✅ Schema extensions created");
}

// ── seed configs ────────────────────────────────────────────────────
const SEEDS = [
  // Swarm
  {
    id: "swarm-procedures",
    area: "swarm",
    description: "Retrieve similar procedure outcomes for swarm task routing",
    retrieval_signal: "procedures.description + outcome",
    fusion_weight: 0.6,
    top_k: 3,
    enabled: 1,
  },
  {
    id: "swarm-episodes",
    area: "swarm",
    description: "Recent swarm episodes with similar entity/task context",
    retrieval_signal: "episodes.entity + task_summary",
    fusion_weight: 0.4,
    top_k: 5,
    enabled: 1,
  },
  // Vault
  {
    id: "vault-semantic",
    area: "vault",
    description: "Semantic search over vault markdown content",
    retrieval_signal: "embeddings",
    fusion_weight: 0.7,
    top_k: 5,
    enabled: 1,
  },
  {
    id: "vault-graph-boost",
    area: "vault",
    description: "Wikilink graph neighbor boost alongside semantic",
    retrieval_signal: "fact_links",
    fusion_weight: 0.3,
    top_k: 3,
    enabled: 1,
  },
  // Autoloop
  {
    id: "autoloop-experiments",
    area: "autoloop",
    description: "Past experiment outcomes for similar optimization targets",
    retrieval_signal: "experiments.target + outcome",
    fusion_weight: 0.5,
    top_k: 5,
    enabled: 1,
  },
  // Eval
  {
    id: "eval-prior-results",
    area: "eval",
    description: "Prior eval pass/fail for same or similar file paths",
    retrieval_signal: "evals.file_path + result",
    fusion_weight: 0.5,
    top_k: 5,
    enabled: 1,
  },
  {
    id: "eval-ac-templates",
    area: "eval",
    description: "Acceptance criteria templates by project/domain",
    retrieval_signal: "ac_templates.criteria_text",
    fusion_weight: 0.4,
    top_k: 3,
    enabled: 1,
  },
  // Persona
  {
    id: "persona-domain-facts",
    area: "persona",
    description: "Domain-specific facts for active persona context injection",
    retrieval_signal: "facts.entity + value",
    fusion_weight: 0.5,
    top_k: 8,
    enabled: 1,
  },
  {
    id: "persona-project-conventions",
    area: "persona",
    description: "Project coding/style conventions from prior sessions",
    retrieval_signal: "facts.category = 'convention'",
    fusion_weight: 0.3,
    top_k: 5,
    enabled: 1,
  },
];

function seedConfigs(db: Database) {
  const insert = db.query(
    `INSERT OR REPLACE INTO rag_configs
     (id, area, description, retrieval_signal, fusion_weight, top_k, enabled)
     VALUES (@id, @area, @description, @retrieval_signal, @fusion_weight, @top_k, @enabled)`
  );

  for (const seed of SEEDS) {
    insert.run({
      "@id": seed.id,
      "@area": seed.area,
      "@description": seed.description,
      "@retrieval_signal": seed.retrieval_signal,
      "@fusion_weight": seed.fusion_weight,
      "@top_k": seed.top_k,
      "@enabled": seed.enabled,
    });
  }

  console.log(`✅ Seeded ${SEEDS.length} RAG configs`);
}

// ── verify memory.db connectivity ───────────────────────────────────
function verifyMemoryDb() {
  try {
    const db = new Database(MEMORY_DB, { readonly: true });
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    db.close();

    const required = ["facts", "fact_embeddings", "episodes", "procedures"];
    const missing = required.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      console.warn(`⚠️  Memory DB missing tables: ${missing.join(", ")}`);
      console.warn("   Run zo-memory-system setup first: bun scripts/memory.ts init");
      return false;
    }
    console.log("✅ Memory DB verified");
    return true;
  } catch {
    console.error(`❌ Cannot open memory.db at ${MEMORY_DB}`);
    return false;
  }
}

// ── main ─────────────────────────────────────────────────────────────
const configDb = new Database(CONFIG_DB);
seedSchema(configDb);
seedConfigs(configDb);
configDb.close();

const memOk = verifyMemoryDb();

console.log("\n📁 Output:");
console.log(`   Config DB: ${CONFIG_DB}`);
console.log(`   Data dir:  ${dataDir}`);
console.log(`\n${memOk ? "✅ Ready to run area integrations" : "⚠️  Fix memory.db setup, then re-run"}`);
