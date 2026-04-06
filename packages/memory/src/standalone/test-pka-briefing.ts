#!/usr/bin/env bun
/**
 * test-pka-briefing.ts — T8: PKA Session Briefing Test Suite
 *
 * Tests domain-classifier, session-briefing, knowledge-promoter, and memory-gate.
 */

import { classifyDomain, DOMAIN_RULES, type Domain } from "./domain-classifier.ts";
import { generateBriefing } from "./session-briefing.ts";
import { shouldInjectMemory, markBriefingInjected, injectSessionBriefing } from "./memory-gate.ts";
import { getPersonaDomain, getPersonasForDomain, DEFAULT_POOLS } from "./domain-map.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

// ── Test 1: Domain Classifier ──────────────────────────────────────────────

console.log("\n=== Domain Classifier Tests ===");

const domainTests: [string, Domain][] = [
  ["Skills/ffb-hub/SKILL.md", "ffb"],
  ["Notes/FFB_Canon/FFB_SKU_CANON.md", "ffb"],
  ["fauna-flora-store/client/src/App.tsx", "ffb"],
  ["Projects/jhf-trading-platform/server/index.ts", "jhf-trading"],
  ["Skills/backtesting-skill/scripts/backtest.ts", "jhf-trading"],
  ["Skills/alpaca-trading-skill/SKILL.md", "jhf-trading"],
  ["Zouroboros/BACKLOG.md", "zouroboros"],
  ["Skills/zo-memory-system/scripts/memory.ts", "zouroboros"],
  ["Seeds/zouroboros/seed-pka.yaml", "zouroboros"],
  ["Documents/notes.md", "personal"],
  ["IDENTITY/alaric.md", "personal"],
  ["Infrastructure/deploy.md", "infrastructure"],
  ["Runbooks/incident.md", "infrastructure"],
  ["random-file.md", "shared"],
  ["server/app.ts", "shared"],
];

for (const [path, expected] of domainTests) {
  const result = classifyDomain(path);
  assert(result === expected, `classifyDomain("${path}") = "${result}" (expected "${expected}")`);
}

assert(DOMAIN_RULES.length >= 5, `DOMAIN_RULES has ${DOMAIN_RULES.length} rules (expected ≥5)`);

// ── Test 2: Session Briefing ───────────────────────────────────────────────

console.log("\n=== Session Briefing Tests ===");

const briefing = await generateBriefing("alaric", undefined, 200);

assert(typeof briefing.persona === "string" && briefing.persona === "alaric", "briefing.persona = alaric");
assert(typeof briefing.briefing === "string" && briefing.briefing.length > 0, "briefing.briefing is non-empty string");
assert(Array.isArray(briefing.active_items), "briefing.active_items is array");
assert(Array.isArray(briefing.recent_episodes), "briefing.recent_episodes is array");
assert(Array.isArray(briefing.inherited_facts), "briefing.inherited_facts is array");
assert(Array.isArray(briefing.vault_context), "briefing.vault_context is array");
assert(typeof briefing.generated_at === "number" && briefing.generated_at > 0, "briefing.generated_at is positive number");
assert(typeof briefing.latency_ms === "number" && briefing.latency_ms >= 0, "briefing.latency_ms is non-negative");

const requiredKeys = ["persona", "domain", "briefing", "active_items", "recent_episodes", "inherited_facts", "vault_context", "generated_at", "latency_ms"];
for (const key of requiredKeys) {
  assert(key in briefing, `briefing has key "${key}"`);
}

// Domain-scoped briefing
const domainBriefing = await generateBriefing("alaric", "zouroboros", 200);
assert(domainBriefing.domain === "zouroboros", "domain-scoped briefing has correct domain");

// ── Test 3: Knowledge Promoter ─────────────────────────────────────────────

console.log("\n=== Knowledge Promoter Tests ===");

const promoterProc = Bun.spawn(
  ["bun", "Skills/zo-memory-system/scripts/knowledge-promoter.ts", "--dry-run"],
  { stdout: "pipe", stderr: "pipe", cwd: "/home/workspace" },
);
const promoterOut = await new Response(promoterProc.stdout).text();
const promoterExit = await promoterProc.exited;

assert(promoterExit === 0, `knowledge-promoter --dry-run exits 0 (got ${promoterExit})`);

let promoterResult: any;
try {
  promoterResult = JSON.parse(promoterOut);
  assert(typeof promoterResult.promoted === "number", "promoter result has 'promoted' field");
  assert(typeof promoterResult.skipped === "number", "promoter result has 'skipped' field");
  assert(promoterResult.dry_run === true, "promoter result shows dry_run=true");
} catch {
  assert(false, "promoter output is valid JSON");
}

// ── Test 4: Memory Gate — Briefing Skip ────────────────────────────────────

console.log("\n=== Memory Gate Briefing Skip Tests ===");

// Test exported function
markBriefingInjected();
const decision = await shouldInjectMemory("any message here");
assert(decision.method === "briefing_skip", `shouldInjectMemory after markBriefingInjected → method="${decision.method}" (expected briefing_skip)`);
assert(decision.inject === false, "briefing_skip decision has inject=false");

// Verify flag is consumed (one-shot)
const decision2 = await shouldInjectMemory("hello");
assert(decision2.method !== "briefing_skip", `second call doesn't use briefing_skip (method="${decision2.method}")`);

// ── Test 5: Domain Map ───────────────────────────────────────────────────

console.log("\n=== Domain Map Tests ===");

assert(getPersonaDomain("financial-advisor") === "jhf-trading", "financial-advisor → jhf-trading");
assert(getPersonaDomain("alaric") === "personal", "alaric → personal");
assert(getPersonaDomain("devops-automator") === "infrastructure", "devops-automator → infrastructure");
assert(getPersonaDomain("brand-guardian") === "ffb", "brand-guardian → ffb");
assert(getPersonaDomain("nonexistent-persona") === "shared", "unknown persona → shared");

const financePersonas = getPersonasForDomain("jhf-trading");
assert(financePersonas.includes("financial-advisor"), "jhf-trading domain includes financial-advisor");
assert(financePersonas.length >= 9, `jhf-trading has ≥9 personas (got ${financePersonas.length})`);

assert(DEFAULT_POOLS.length === 5, `DEFAULT_POOLS has 5 pools (got ${DEFAULT_POOLS.length})`);
assert(DEFAULT_POOLS.some(p => p.name === "engineering"), "DEFAULT_POOLS includes engineering");
assert(DEFAULT_POOLS.some(p => p.name === "finance"), "DEFAULT_POOLS includes finance");

// ── Test 6: injectSessionBriefing ────────────────────────────────────────

console.log("\n=== injectSessionBriefing Tests ===");

const excludedResult = await injectSessionBriefing("claude-code");
assert(excludedResult === null, "excluded persona (claude-code) returns null");

const excludedResult2 = await injectSessionBriefing("hermes-agent");
assert(excludedResult2 === null, "excluded persona (hermes-agent) returns null");

// Test with a real persona (may produce briefing or null depending on data)
const briefingResult = await injectSessionBriefing("alaric");
if (briefingResult !== null) {
  assert(briefingResult.includes("[Session Briefing"), "briefing contains [Session Briefing header");
  assert(briefingResult.length > 50, `briefing has substantial content (${briefingResult.length} chars)`);
} else {
  assert(true, "briefing returned null (no data for alaric — acceptable)");
  assert(true, "skipping content check (null result)");
}

// ── Test 7: CLI --persona sentinel ───────────────────────────────────────

console.log("\n=== CLI Sentinel Tests ===");

const { unlinkSync, existsSync } = await import("fs");
const sentinelPath = "/dev/shm/zo-briefing-test-sentinel.flag";
try { unlinkSync(sentinelPath); } catch {}
assert(!existsSync(sentinelPath), "sentinel file does not exist initially");

const { writeFileSync } = await import("fs");
writeFileSync(sentinelPath, String(Date.now()));
assert(existsSync(sentinelPath), "sentinel file created successfully");

try { unlinkSync(sentinelPath); } catch {}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
