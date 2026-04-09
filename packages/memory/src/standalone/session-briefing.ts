#!/usr/bin/env bun
/**
 * session-briefing.ts — T5: PKA Session Briefing
 *
 * Proactive knowledge synthesis layer. Fires on persona activation,
 * synthesizes domain-scoped briefing from vault + memory + episodes + open loops.
 *
 * Usage:
 *   bun session-briefing.ts <persona>                        # default briefing
 *   bun session-briefing.ts <persona> --domain ffb           # domain-scoped
 *   bun session-briefing.ts <persona> --json                 # JSON output
 *   bun session-briefing.ts <persona> --max-tokens 300       # cap synthesis input
 */

import { Database } from "bun:sqlite";
import { parseArgs } from "util";
import { loadPersonaContext } from "./vault-persona-loader.ts";
import { searchCrossPersona, getAccessiblePersonas } from "./cross-persona.ts";
import { getPersonaDomain, getPersonaDomains } from "./domain-map.ts";

const DB_PATH = process.env.ZO_MEMORY_DB || "/home/workspace/.zo/memory/shared-facts.db";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const SYNTHESIS_MODEL = process.env.PKA_MODEL || "qwen2.5:1.5b";
const DEFAULT_MAX_TOKENS = 500;

interface SessionBriefing {
  persona: string;
  domain: string | null;
  briefing: string;
  active_items: string[];
  recent_episodes: string[];
  inherited_facts: string[];
  vault_context: string[];
  generated_at: number;
  latency_ms: number;
}

// ── Step 1: Vault Context ──────────────────────────────────────────────────

function getVaultContext(persona: string, domain?: string): string[] {
  const ctx = loadPersonaContext(persona, domain);
  const files: string[] = [];
  for (const f of ctx.convention_files.slice(0, 5)) {
    files.push(f.title);
  }
  for (const f of ctx.graph_files.slice(0, 3)) {
    files.push(`${f.title} (via ${f.via})`);
  }
  return files;
}

// ── Step 2: Recent Episodes ────────────────────────────────────────────────

function getRecentEpisodes(domain?: string, limit = 5): string[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const fourteenDaysAgo = Math.floor(Date.now() / 1000) - 14 * 86400;
    let rows: { summary: string; outcome: string; happened_at: number }[];

    if (domain) {
      // Filter episodes by entity patterns matching domain (centralized in domain-map.ts)
      const DOMAIN_ENTITY_PATTERNS: Record<string, string[]> = {
        ffb: ["ffb", "fauna", "flora"],
        "jhf-trading": ["jhf", "trading", "alpaca", "backtest"],
        zouroboros: ["zouroboros", "swarm", "memory", "vault", "orchestrat"],
        personal: ["personal", "user"],
        infrastructure: ["infra", "deploy", "service"],
      };
      const patterns = DOMAIN_ENTITY_PATTERNS[domain] || [];
      if (patterns.length > 0) {
        const likeClause = patterns.map(p => `ee.entity LIKE '%${p}%'`).join(" OR ");
        rows = db.prepare(`
          SELECT DISTINCT e.summary, e.outcome, e.happened_at
          FROM episodes e
          JOIN episode_entities ee ON e.id = ee.episode_id
          WHERE e.happened_at > ? AND (${likeClause})
          ORDER BY e.happened_at DESC LIMIT ?
        `).all(fourteenDaysAgo, limit) as typeof rows;
      } else {
        rows = db.prepare(`
          SELECT summary, outcome, happened_at FROM episodes
          WHERE happened_at > ? ORDER BY happened_at DESC LIMIT ?
        `).all(fourteenDaysAgo, limit) as typeof rows;
      }
    } else {
      rows = db.prepare(`
        SELECT summary, outcome, happened_at FROM episodes
        WHERE happened_at > ? ORDER BY happened_at DESC LIMIT ?
      `).all(fourteenDaysAgo, limit) as typeof rows;
    }

    return rows.map(r => {
      const date = new Date(r.happened_at * 1000).toISOString().slice(0, 10);
      return `[${r.outcome}] ${date}: ${r.summary}`;
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// ── Step 3: Open Loops ─────────────────────────────────────────────────────

function getOpenLoops(persona: string, limit = 5): string[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const hasTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='open_loops'"
    ).get();
    if (!hasTable) return [];

    const rows = db.prepare(`
      SELECT title, kind, priority, created_at FROM open_loops
      WHERE status IN ('open', 'stale')
        AND (persona = ? OR persona = 'shared')
      ORDER BY priority DESC, created_at DESC
      LIMIT ?
    `).all(persona, limit) as { title: string; kind: string; priority: number; created_at: number }[];

    return rows.map(r => {
      const date = new Date(r.created_at * 1000).toISOString().slice(0, 10);
      return `[${r.kind}] ${r.title} (${date})`;
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// ── Step 4: Cross-Persona Facts ────────────────────────────────────────────

function getInheritedFacts(persona: string, domain?: string, limit = 3): string[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const accessible = getAccessiblePersonas(db, persona);
    if (accessible.length <= 1) return []; // only self

    const query = domain || persona;
    const results = searchCrossPersona(db, persona, query, limit);
    return results
      .filter((r: any) => r.persona !== persona)
      .slice(0, limit)
      .map((r: any) => `[${r.persona}] ${r.entity}: ${String(r.value).slice(0, 120)}`);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// ── Step 5: Ollama Synthesis ───────────────────────────────────────────────

async function synthesize(
  persona: string,
  domain: string | null,
  vaultContext: string[],
  episodes: string[],
  openLoops: string[],
  inheritedFacts: string[],
  maxTokens: number,
): Promise<string> {
  const contextParts: string[] = [];

  if (vaultContext.length > 0) {
    contextParts.push(`Relevant files: ${vaultContext.join("; ")}`);
  }
  if (episodes.length > 0) {
    contextParts.push(`Recent activity: ${episodes.join("; ")}`);
  }
  if (openLoops.length > 0) {
    contextParts.push(`Open items: ${openLoops.join("; ")}`);
  }
  if (inheritedFacts.length > 0) {
    contextParts.push(`Cross-persona knowledge: ${inheritedFacts.join("; ")}`);
  }

  if (contextParts.length === 0) {
    return `No recent activity found for ${persona}${domain ? ` in domain ${domain}` : ""}. Starting fresh.`;
  }

  // Cap input to maxTokens worth of characters (~4 chars per token)
  let input = contextParts.join("\n");
  const charLimit = maxTokens * 4;
  if (input.length > charLimit) {
    input = input.slice(0, charLimit) + "...";
  }

  const prompt = `You are synthesizing a brief session briefing for the "${persona}" persona${domain ? ` (domain: ${domain})` : ""}.

Based on this context, write a 3-5 sentence briefing that covers:
1. What's currently active or in-progress
2. Any open items needing attention
3. Key recent outcomes

Context:
${input}

Respond with ONLY the briefing text, no headers or bullets.`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return `[Synthesis unavailable — Ollama returned ${response.status}] Raw context: ${input.slice(0, 300)}`;
    }

    const data = await response.json() as { response: string };
    return data.response.trim();
  } catch (err) {
    return `[Synthesis unavailable — ${err instanceof Error ? err.message : "timeout"}] Raw context: ${input.slice(0, 300)}`;
  }
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

export async function generateBriefing(
  persona: string,
  domain?: string,
  maxTokens = DEFAULT_MAX_TOKENS,
): Promise<SessionBriefing> {
  const start = performance.now();

  // Check if this is a multi-domain persona (e.g., alaric)
  const multiDomains = !domain ? getPersonaDomains(persona) : null;

  if (multiDomains && multiDomains.length > 1) {
    // Multi-domain briefing: aggregate episodes from all domains, deduplicate
    const allEpisodes: string[] = [];
    const allVault: string[] = [];
    const seenEpisodes = new Set<string>();

    for (const d of multiDomains) {
      const domainEps = getRecentEpisodes(d, 3);
      for (const ep of domainEps) {
        if (!seenEpisodes.has(ep)) {
          seenEpisodes.add(ep);
          allEpisodes.push(ep);
        }
      }
      const domainVault = getVaultContext(persona, d);
      for (const v of domainVault) {
        if (!allVault.includes(v)) allVault.push(v);
      }
    }

    const generalEps = getRecentEpisodes(undefined, 3);
    for (const ep of generalEps) {
      if (!seenEpisodes.has(ep)) {
        seenEpisodes.add(ep);
        allEpisodes.push(ep);
      }
    }

    const openLoops = getOpenLoops(persona);
    const inheritedFacts = getInheritedFacts(persona, undefined);

    const episodes = allEpisodes.slice(0, 8);
    const vaultContext = allVault.slice(0, 8);
    const domainLabel = multiDomains.join("+");

    const briefing = await synthesize(
      persona, domainLabel, vaultContext, episodes, openLoops, inheritedFacts, maxTokens,
    );

    const latency_ms = Math.round(performance.now() - start);
    return {
      persona,
      domain: domainLabel,
      briefing,
      active_items: openLoops,
      recent_episodes: episodes,
      inherited_facts: inheritedFacts,
      vault_context: vaultContext,
      generated_at: Math.floor(Date.now() / 1000),
      latency_ms,
    };
  }

  // Single-domain briefing (original path)
  if (!domain) {
    const resolved = getPersonaDomain(persona);
    if (resolved !== "shared" && resolved !== "personal") {
      domain = resolved;
    }
  }

  const [vaultContext, episodes, openLoops, inheritedFacts] = await Promise.all([
    Promise.resolve(getVaultContext(persona, domain)),
    Promise.resolve(getRecentEpisodes(domain)),
    Promise.resolve(getOpenLoops(persona)),
    Promise.resolve(getInheritedFacts(persona, domain)),
  ]);

  const briefing = await synthesize(
    persona, domain ?? null, vaultContext, episodes, openLoops, inheritedFacts, maxTokens,
  );

  const latency_ms = Math.round(performance.now() - start);

  return {
    persona,
    domain: domain ?? null,
    briefing,
    active_items: openLoops,
    recent_episodes: episodes,
    inherited_facts: inheritedFacts,
    vault_context: vaultContext,
    generated_at: Math.floor(Date.now() / 1000),
    latency_ms,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      domain: { type: "string", short: "d" },
      json: { type: "boolean" },
      "max-tokens": { type: "string", short: "m" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    console.log(`Usage:
  bun session-briefing.ts <persona>                    Generate session briefing
  bun session-briefing.ts <persona> --domain ffb       Domain-scoped briefing
  bun session-briefing.ts <persona> --json             JSON output
  bun session-briefing.ts <persona> --max-tokens 300   Cap synthesis input

  Domains: ffb, jhf-trading, zouroboros, personal, infrastructure, shared`);
    process.exit(0);
  }

  const persona = positionals[0];
  const maxTokens = values["max-tokens"] ? parseInt(values["max-tokens"]) : DEFAULT_MAX_TOKENS;

  const result = await generateBriefing(persona, values.domain, maxTokens);

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n=== Session Briefing: ${result.persona} ===`);
    if (result.domain) console.log(`Domain: ${result.domain}`);
    console.log(`Generated: ${new Date(result.generated_at * 1000).toISOString()} (${result.latency_ms}ms)\n`);
    console.log(result.briefing);

    if (result.active_items.length > 0) {
      console.log(`\n--- Open Items (${result.active_items.length}) ---`);
      for (const item of result.active_items) console.log(`  • ${item}`);
    }
    if (result.recent_episodes.length > 0) {
      console.log(`\n--- Recent Episodes (${result.recent_episodes.length}) ---`);
      for (const ep of result.recent_episodes) console.log(`  • ${ep}`);
    }
    if (result.vault_context.length > 0) {
      console.log(`\n--- Vault Context (${result.vault_context.length}) ---`);
      for (const f of result.vault_context) console.log(`  • ${f}`);
    }
  }
}
