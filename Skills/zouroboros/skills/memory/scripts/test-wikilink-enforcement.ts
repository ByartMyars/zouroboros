#!/usr/bin/env bun
/**
 * test-wikilink-enforcement.ts — Unit tests for wikilink auto-correction and exclusion filter
 *
 * Tests AC3 (exclusion filter), AC4 (two-tier confidence), AC1 (auto-wrap), AC6 (cross-fact).
 * Requires: 10+ positive cases (should wrap), 10+ negative cases (should exclude).
 *
 * Usage: bun test-wikilink-enforcement.ts
 */

import { Database } from "bun:sqlite";
import {
  shouldExcludeFromWrapping,
  autoCorrectWikilinks,
  extractWikilinks,
  ENTITY_LIKE_PATTERN,
} from "./wikilink-utils";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- Setup: in-memory DB with some known entities ---

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE facts (
      id TEXT PRIMARY KEY,
      persona TEXT,
      entity TEXT NOT NULL,
      key TEXT,
      value TEXT NOT NULL DEFAULT '',
      text TEXT,
      category TEXT DEFAULT 'general',
      decay_class TEXT DEFAULT 'stable',
      importance REAL DEFAULT 1.0,
      source TEXT,
      created_at INTEGER,
      expires_at INTEGER,
      last_accessed INTEGER,
      confidence REAL DEFAULT 1.0,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS fact_links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related',
      weight REAL DEFAULT 1.0,
      PRIMARY KEY (source_id, target_id, relation)
    );
    CREATE TABLE IF NOT EXISTS vault_files (
      id TEXT PRIMARY KEY,
      title TEXT
    );
  `);

  // Insert known entities
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  for (const entity of ["project.ffb", "system.memory", "config.routing", "persona.hermes", "tool.ollama"]) {
    db.prepare(
      "INSERT INTO facts (id, persona, entity, key, value, text, category, created_at, last_accessed) VALUES (?, 'test', ?, 'status', 'active', ?, 'general', ?, ?)"
    ).run(crypto.randomUUID(), entity, `${entity} status: active`, now, nowSec);
  }

  return db;
}

// ============================================================
// TEST SUITE 1: shouldExcludeFromWrapping — Negative cases
// (these should be EXCLUDED, i.e., NOT wrapped)
// ============================================================

console.log("\n=== Exclusion Filter: Negative Cases (should exclude) ===\n");

// 1. File extensions
assert(shouldExcludeFromWrapping("memory.ts") === true, "Excludes .ts file extension");
assert(shouldExcludeFromWrapping("config.json") === true, "Excludes .json file extension");
assert(shouldExcludeFromWrapping("readme.md") === true, "Excludes .md file extension");
assert(shouldExcludeFromWrapping("styles.css") === true, "Excludes .css file extension");
assert(shouldExcludeFromWrapping("schema.sql") === true, "Excludes .sql file extension");
assert(shouldExcludeFromWrapping("package.lock") === true, "Excludes .lock file extension");

// 2. URL patterns
assert(shouldExcludeFromWrapping("google.com") === true, "Excludes .com domain");
assert(shouldExcludeFromWrapping("github.io") === true, "Excludes .io domain");
assert(shouldExcludeFromWrapping("vercel.app") === true, "Excludes .app domain");
assert(shouldExcludeFromWrapping("npmjs.org") === true, "Excludes .org domain");

// 3. Version strings
assert(shouldExcludeFromWrapping("v2.0") === true, "Excludes version string v2.0");
assert(shouldExcludeFromWrapping("v3.3.1") === true, "Excludes version string v3.3.1");

// 4. Abbreviations
assert(shouldExcludeFromWrapping("e.g") === true, "Excludes abbreviation e.g");
assert(shouldExcludeFromWrapping("i.e") === true, "Excludes abbreviation i.e");

// ============================================================
// TEST SUITE 2: shouldExcludeFromWrapping — Positive cases
// (these should NOT be excluded, i.e., they SHOULD be wrapped)
// ============================================================

console.log("\n=== Exclusion Filter: Positive Cases (should NOT exclude) ===\n");

assert(shouldExcludeFromWrapping("project.ffb") === false, "Allows project.ffb (canonical entity)");
assert(shouldExcludeFromWrapping("system.memory") === false, "Allows system.memory (canonical entity)");
assert(shouldExcludeFromWrapping("config.routing") === false, "Allows config.routing (canonical entity)");
assert(shouldExcludeFromWrapping("persona.hermes") === false, "Allows persona.hermes (canonical entity)");
assert(shouldExcludeFromWrapping("tool.ollama") === false, "Allows tool.ollama (canonical entity)");
assert(shouldExcludeFromWrapping("swarm.orchestrator") === false, "Allows swarm.orchestrator");
assert(shouldExcludeFromWrapping("eval.pipeline") === false, "Allows eval.pipeline");
assert(shouldExcludeFromWrapping("memory.gate") === false, "Allows memory.gate");
assert(shouldExcludeFromWrapping("skill.interview") === false, "Allows skill.interview");
assert(shouldExcludeFromWrapping("phase.integration") === false, "Allows phase.integration");

// ============================================================
// TEST SUITE 3: autoCorrectWikilinks — Known entities (DB-backed)
// ============================================================

console.log("\n=== Auto-Correction: Known Entities (DB tier) ===\n");

const db = createTestDb();

{
  const result = autoCorrectWikilinks("Uses project.ffb for deployment", db);
  assert(result !== null, "Corrects known entity project.ffb");
  assert(result?.corrected_value === "Uses [[project.ffb]] for deployment", "Wraps project.ffb in [[]]", result?.corrected_value);
  assert(result?.confidence_tier === "known", "Tier is 'known' for DB entity");
}

{
  const result = autoCorrectWikilinks("Integrates system.memory and tool.ollama", db);
  assert(result !== null, "Corrects multiple known entities");
  assert(
    result?.corrected_value.includes("[[system.memory]]") && result?.corrected_value.includes("[[tool.ollama]]"),
    "Both entities wrapped",
    result?.corrected_value
  );
  assert(result?.corrections_made.length === 2, "Two corrections made");
}

// ============================================================
// TEST SUITE 4: autoCorrectWikilinks — Pattern tier (no DB match)
// ============================================================

console.log("\n=== Auto-Correction: Pattern Tier (no DB match) ===\n");

{
  const result = autoCorrectWikilinks("References swarm.orchestrator module", db);
  assert(result !== null, "Corrects pattern-matching entity");
  assert(result?.corrected_value === "References [[swarm.orchestrator]] module", "Wraps pattern entity", result?.corrected_value);
  assert(result?.confidence_tier === "pattern", "Tier is 'pattern' for unknown entity");
}

// ============================================================
// TEST SUITE 5: autoCorrectWikilinks — No double-wrapping
// ============================================================

console.log("\n=== Auto-Correction: No Double-Wrapping ===\n");

{
  const result = autoCorrectWikilinks("Already linked [[project.ffb]] here", db);
  assert(result === null, "No correction when already wikilinked");
}

{
  const result = autoCorrectWikilinks("Has [[system.memory]] and tool.ollama", db);
  assert(result !== null, "Corrects unwrapped while skipping wrapped");
  assert(
    result?.corrected_value === "Has [[system.memory]] and [[tool.ollama]]",
    "Only wraps the bare entity",
    result?.corrected_value
  );
  assert(result?.corrections_made.length === 1, "Only one correction");
}

// ============================================================
// TEST SUITE 6: autoCorrectWikilinks — Exclusion in context
// ============================================================

console.log("\n=== Auto-Correction: Exclusion Filter in Context ===\n");

{
  const result = autoCorrectWikilinks("Edit the memory.ts file for v3.0 changes", db);
  assert(result === null, "No correction for file extension and version string");
}

{
  const result = autoCorrectWikilinks("Visit example.com for docs about project.ffb", db);
  assert(result !== null, "Corrects project.ffb but not example.com");
  assert(
    !result?.corrected_value.includes("[[example.com]]"),
    "Does not wrap .com domain",
    result?.corrected_value
  );
  assert(
    result?.corrected_value.includes("[[project.ffb]]"),
    "Does wrap project.ffb",
    result?.corrected_value
  );
}

// ============================================================
// TEST SUITE 7: autoCorrectWikilinks — Self-entity skip
// ============================================================

console.log("\n=== Auto-Correction: Self-Entity Skip ===\n");

{
  const result = autoCorrectWikilinks("The project.ffb system uses tool.ollama", db, "project.ffb");
  assert(result !== null, "Still corrects other entities");
  assert(
    !result?.corrected_value.includes("[[project.ffb]]"),
    "Does not wrap self-entity",
    result?.corrected_value
  );
  assert(
    result?.corrected_value.includes("[[tool.ollama]]"),
    "Wraps non-self entity",
    result?.corrected_value
  );
}

// ============================================================
// TEST SUITE 8: autoCorrectWikilinks — Metadata preservation
// ============================================================

console.log("\n=== Auto-Correction: Original Value Preserved ===\n");

{
  const result = autoCorrectWikilinks("Uses project.ffb for tasks", db);
  assert(result !== null, "Correction made");
  assert(result?.original_value === "Uses project.ffb for tasks", "Original value preserved");
  assert(result?.corrected_value !== result?.original_value, "Corrected value differs from original");
}

// ============================================================
// SUMMARY
// ============================================================

db.close();

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
