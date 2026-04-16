#!/usr/bin/env bun
/**
 * eval-memory.ts
 * Integrates zo-memory-system RAG into three-stage-eval.
 * Stores + retrieves prior eval results for smarter AC design.
 */

import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DB = "/home/workspace/.zo/memory/shared-facts.db";
const CONFIG_DB = resolve(__dirname, "../data/rag-config.db");
const EMBEDDING_MODEL = "nomic-embed-text";
const EMBEDDING_URL = "http://localhost:11434/api/embeddings";

// ── Ollama embed ────────────────────────────────────────────────────────────
async function embed(text: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json() as { embedding?: number[] };
  if (!data.embedding) throw new Error("No embedding returned");
  return data.embedding;
}

// ── Cosine similarity ──────────────────────────────────────────────────────
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// ── Store eval result ──────────────────────────────────────────────────────
async function storeEvalResult(data: { file_path: string; phase: string; result: string; score?: number; failure_reason?: string; metadata?: any }) {
  const mem = new Database(MEMORY_DB);
  const id = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entity = `eval.${data.file_path.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60)}`;
  const key = `phase.${data.phase}.${data.result}`;
  const value = JSON.stringify({ score: data.score, failure_reason: data.failure_reason, metadata: data.metadata });
  mem.run(
    "INSERT INTO facts (id, persona, entity, key, value, category) VALUES (?, ?, ?, ?, ?, ?)",
    [id, "three-stage-eval", entity, key, value, "eval"]
  );
  const vec = await embed(`${data.file_path} ${data.phase} ${data.result} ${data.failure_reason ?? ""}`);
  mem.run("INSERT INTO fact_embeddings (fact_id, embedding) VALUES (?, ?)", [id, Buffer.from(new Float32Array(vec).buffer)]);
  mem.close();
  console.log(`✅ Eval stored: ${id} — ${data.file_path} ${data.phase} [${data.result}]`);
}

// ── Prior evals ────────────────────────────────────────────────────────────
async function getPriorEvals(filePath: string): Promise<any[]> {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    const rows = mem.query(
      "SELECT id, entity, key, value FROM facts WHERE entity LIKE 'eval.%' AND entity LIKE ? ORDER BY created_at DESC LIMIT 10"
    ).all(`%${filePath.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 40)}%`) as any[];
    mem.close();
    return rows;
  } catch {
    return [];
  }
}

// ── Semantic search ─────────────────────────────────────────────────────────
async function semanticSearch(query: string): Promise<void> {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    const [keyword, vector] = await Promise.all([
      Promise.resolve(mem.query("SELECT id, entity, key, value FROM facts WHERE entity LIKE 'eval.%' LIMIT 200").all() as any[]),
      embed(query).catch(() => null),
    ]);
    if (!vector) { mem.close(); return; }
    const embRows = mem.query(
      "SELECT fe.fact_id, fe.embedding FROM fact_embeddings fe WHERE fe.fact_id IN (SELECT id FROM facts WHERE entity LIKE 'eval.%')"
    ).all() as any[];
    const factMap = new Map(keyword.map((f: any) => [f.id, f]));
    const scored = embRows.map((row: any) => {
      const arr = Array.from(new Float32Array(Buffer.from(row.embedding)));
      return { fact: factMap.get(row.fact_id), score: cosineSim(vector, arr) };
    }).filter((s) => s.fact && s.score > 0.3).sort((a, b) => b.score - a.score).slice(0, 5);
    mem.close();
    if (scored.length === 0) { console.log("No prior evals found"); return; }
    console.log("Prior evals:\n");
    for (const s of scored) {
      if (!s.fact) continue;
      const v = s.fact.value;
      const parsed = v.startsWith("{") ? JSON.parse(v) : { result: v };
      console.log(`  [${s.score.toFixed(3)}] ${s.fact.entity}: ${s.fact.key} — ${parsed.result ?? ""}`);
    }
  } catch {
    console.log("⚠️  Memory DB not accessible");
  }
}

// ── AC template ─────────────────────────────────────────────────────────────
function getACTemplate(phase: string): string | null {
  try {
    const cfg = new Database(CONFIG_DB, { readonly: true });
    const row = cfg.query("SELECT config_json FROM rag_configs WHERE area = 'three-stage-eval' AND enabled = 1").get() as any;
    cfg.close();
    if (!row?.config_json) return null;
    const templates = JSON.parse(row.config_json).ac_templates ?? {};
    return templates[phase] ?? null;
  } catch {
    return null;
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────
function showStats() {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    let evalCount = 0, passCount = 0, templateCount = 0, recents: any[] = [];
    try {
      evalCount = (mem.query("SELECT COUNT(*) as c FROM facts WHERE entity LIKE 'eval.%'").get() as any)?.c ?? 0;
      passCount = (mem.query("SELECT COUNT(*) as c FROM facts WHERE entity LIKE 'eval.%' AND key LIKE '%pass'").get() as any)?.c ?? 0;
      recents = mem.query("SELECT entity, key, value, created_at FROM facts WHERE entity LIKE 'eval.%' ORDER BY created_at DESC LIMIT 5").all() as any[];
      mem.close();
    } catch {
      mem.close();
      console.log("⚠️  Some memory tables missing (run zo-memory-system setup)");
      return;
    }
    console.log("🔍 Three-Stage Eval RAG Stats");
    console.log(`   Total evals:      ${evalCount}`);
    console.log(`   Pass rate:        ${evalCount > 0 ? ((passCount / evalCount) * 100).toFixed(0) : 0}%`);
    console.log(`\n🕐 Recent:`);
    if (recents.length === 0) { console.log("   (none — store evals with --store to populate)"); return; }
    for (const e of recents) {
      const d = e.created_at ? new Date(e.created_at * 1000).toLocaleDateString() : "?";
      console.log(`   ${e.entity.split(".").pop()} (${d}) — ${e.key}`);
    }
  } catch {
    console.log("⚠️  Memory DB not initialized");
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--stats")) { showStats(); return; }
  if (args.includes("--prior")) {
    const idx = args.indexOf("--prior") + 1;
    const rows = await getPriorEvals(args[idx] ?? "");
    if (rows.length === 0) { console.log("No prior evals for this file"); }
    else { for (const r of rows) console.log(`  ${r.key}: ${r.value}`); }
    return;
  }
  if (args.includes("--store")) {
    const idx = args.indexOf("--store") + 1;
    const data = JSON.parse(await Bun.file(args[idx]).text());
    await storeEvalResult(data);
    return;
  }
  if (args.includes("--ac-template")) {
    const phase = args[args.indexOf("--ac-template") + 1] ?? "mechanical";
    const tmpl = getACTemplate(phase);
    console.log(tmpl ?? "No template for this phase");
    return;
  }
  const query = args.find((a) => !a.startsWith("--")) ?? "eval";
  await semanticSearch(query);
}

main().catch(console.error);
