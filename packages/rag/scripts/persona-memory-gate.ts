#!/usr/bin/env bun
/**
 * persona-memory-gate.ts
 *
 * Mirrors the zo-memory-system memory gate but for persona-specific context injection.
 * Triggers on conversation start (excludes claude-code, gemini-cli, hermes, codex).
 * Retrieves domain facts and project conventions for the active persona.
 *
 * Usage:
 *   bun persona-memory-gate.ts --persona "Frontend Developer"
 *   bun persona-memory-gate.ts --persona "Financial Advisor" --query "portfolio"
 *   bun persona-memory-gate.ts --domains
 */

import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DB = "/home/workspace/.zo/memory/shared-facts.db";
const CONFIG_DB = resolve(__dirname, "../data/rag-config.db");

// ── Excluded personas (same as memory-gate rule) ────────────────────
const EXCLUDED_PERSONAS = new Set([
  "claude-code", "gemini-cli", "hermes", "codex",
  "47fea1a7", "5840f80f", "dbe6c73c", "beb55a68", // persona IDs
]);

// ── Persona → domain mapping ─────────────────────────────────────────
const PERSONA_DOMAINS: Record<string, string[]> = {
  "Frontend Developer": ["frontend", "react", "tailwind", "zo-space", "typescript"],
  "Backend Architect": ["backend", "api", "database", "server", "node"],
  "Financial Advisor": ["finance", "trading", "portfolio", "investment", "market"],
  "DevOps Automator": ["devops", "infrastructure", "docker", "ci-cd", "deployment"],
  "UX Researcher": ["ux", "design", "user-research", "accessibility"],
  "Marketing Strategist": ["marketing", "seo", "social", "content", "ffb"],
  "Alaric": ["personal", "assistant", "general"],
  "default": ["general", "project", "workspace"],
};

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const personaIdx = args.indexOf("--persona");
const queryIdx = args.indexOf("--query");
const domainsIdx = args.indexOf("--domains");

const mode = domainsIdx !== -1 ? "domains" : "gate";
const persona = personaIdx !== -1 ? args[personaIdx + 1] : "default";
const extraQuery = queryIdx !== -1 ? args[queryIdx + 1] : null;

// ── Ollama embed (HTTP API) ────────────────────────────────────────
async function embed(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  const data = await res.json() as { embedding?: number[] };
  if (!data.embedding) throw new Error("No embedding returned from Ollama");
  return data.embedding;
}

// ── Check if persona is excluded ────────────────────────────────────
function isExcluded(p: string): boolean {
  return EXCLUDED_PERSONAS.has(p.toLowerCase());
}

// ── Get domains for persona ─────────────────────────────────────────
function getDomains(p: string): string[] {
  if (isExcluded(p)) return [];
  return PERSONA_DOMAINS[p] ?? PERSONA_DOMAINS["default"];
}

// ── Query domain facts ───────────────────────────────────────────────
async function queryDomainFacts(domains: string[], extraQuery?: string | null, topK = 8): Promise<any[]> {
  if (!domains || domains.length === 0) return [];
  let rows: any[] = [];
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    const domainList = domains.map((d) => `category LIKE '%${d}%'`).join(" OR ");
    const extraClause = extraQuery ? ` OR value LIKE '%${extraQuery}%'` : "";

    rows = mem
      .query(
        `SELECT id, entity, key, value, category, confidence
         FROM facts
         WHERE (${domainList})${extraClause}
           AND decay_class != 'deleted'
         ORDER BY confidence DESC, created_at DESC
         LIMIT :k`
      )
      .all({ k: topK });
    mem.close();
  } catch { /* facts table may not exist yet */ }
  return rows;
}

// ── Query project conventions ────────────────────────────────────────
async function queryConventions(topK = 5): Promise<any[]> {
  let rows: any[] = [];
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    rows = mem
      .query(
        `SELECT id, entity, key, value, category
         FROM facts
         WHERE category = 'convention'
           AND decay_class != 'deleted'
         ORDER BY created_at DESC
         LIMIT :k`
      )
      .all({ k: topK });
    mem.close();
  } catch { /* facts table may not exist yet */ }
  return rows;
}

// ── Get persona context block ────────────────────────────────────────
async function getPersonaContext(p: string, extraQuery?: string | null): Promise<string> {
  if (isExcluded(p)) {
    return `// Persona ${p} is excluded from memory gate — no context injected`;
  }

  const domains = getDomains(p);
  const [facts, conventions] = await Promise.all([
    queryDomainFacts(domains, extraQuery, 8),
    queryConventions(5),
  ]);

  const lines: string[] = [];

  if (facts.length > 0) {
    lines.push(`[${p} — domain facts]`);
    facts.forEach((f) => {
      const cats = f.category?.split(",").join(", ") ?? "";
      lines.push(`• ${f.entity}: ${f.value}${cats ? ` (${cats})` : ""}`);
    });
    lines.push("");
  }

  if (conventions.length > 0) {
    lines.push("[Project conventions]");
    conventions.forEach((c) => {
      lines.push(`• ${c.value}`);
    });
    lines.push("");
  }

  if (lines.length === 0) {
    return `// No memory context found for persona "${p}" (domains: ${domains.join(", ")})`;
  }

  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  switch (mode) {
    case "domains": {
      console.log("📋 Persona → Domain mapping:\n");
      for (const [p, domains] of Object.entries(PERSONA_DOMAINS)) {
        console.log(`  ${p}: ${domains.join(", ")}`);
      }
      break;
    }

    case "gate": {
      if (isExcluded(persona)) {
        console.log(`⏭️  ${persona} — excluded from memory gate`);
        return;
      }

      const context = await getPersonaContext(persona, extraQuery);
      console.log(context);
      break;
    }
  }
}

main().catch(console.error);
