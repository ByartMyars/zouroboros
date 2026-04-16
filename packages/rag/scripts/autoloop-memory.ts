#!/usr/bin/env bun
/**
 * autoloop-memory.ts
 * Integrates zo-memory-system RAG into the autoloop skill.
 * Stores + retrieves experiment results for informed iteration decisions.
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
  if (!data.embedding) throw new Error("No embedding returned from Ollama");
  return data.embedding;
}

// ── Cosine similarity ──────────────────────────────────────────────────────
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// ── Config ─────────────────────────────────────────────────────────────────
function getConfig(area: string) {
  const cfg = new Database(CONFIG_DB, { readonly: true });
  const row = cfg.query("SELECT top_k, fusion_weight FROM rag_configs WHERE area = ? AND enabled = 1").get(area) as any;
  cfg.close();
  return row ?? { top_k: 5, fusion_weight: 0.3 };
}

// ── Query past experiments ──────────────────────────────────────────────────
async function queryExperiments(query: string) {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    const [keyword, vector] = await Promise.all([
      Promise.resolve(mem.query("SELECT id, entity, key, value FROM facts WHERE entity LIKE 'autoloop%' LIMIT 200").all() as any[]),
      embed(query).catch(() => null),
    ]);
    if (!vector) { mem.close(); return; }
    const embRows = mem.query(
      "SELECT fe.fact_id, fe.embedding FROM fact_embeddings fe WHERE fe.fact_id IN (SELECT id FROM facts WHERE entity LIKE 'autoloop%')"
    ).all() as any[];
    const factMap = new Map(keyword.map((f: any) => [f.id, f]));
    const scored = embRows.map((row: any) => {
      const vec = new Float32Array(Buffer.from(row.embedding));
      const arr = Array.from(vec);
      return { fact: factMap.get(row.fact_id), score: cosineSim(vector, arr) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
    mem.close();
    if (scored.length === 0) { console.log("No prior experiments found"); return; }
    console.log("Prior experiments:\n");
    for (const s of scored) {
      if (!s.fact) continue;
      console.log(`  [${s.score.toFixed(3)}] ${s.fact.key}: ${s.fact.value}`);
    }
  } catch {
    console.log("⚠️  Memory DB not accessible");
  }
}

// ── Store experiment ───────────────────────────────────────────────────────
async function storeExperiment(data: { target: string; metric: string; iteration?: number; delta?: number; result?: string; program_md?: string }) {
  try {
    const mem = new Database(MEMORY_DB);
    const id = `autoloop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entity = `autoloop.${data.target.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const key = `experiment.${data.metric}`;
    const value = JSON.stringify({ iteration: data.iteration, delta: data.delta, result: data.result });
    mem.run("INSERT INTO facts (id, persona, entity, key, value, category) VALUES (?, ?, ?, ?, ?, ?)",
      [id, "autoloop-memory", entity, key, value, "autoloop"]);
    const vec = await embed(`${data.target} ${data.metric} ${value}`);
    mem.run("INSERT INTO fact_embeddings (fact_id, embedding) VALUES (?, ?)", [id, Buffer.from(new Float32Array(vec).buffer)]);
    mem.close();
    console.log(`✅ Experiment stored: ${id} — ${entity} ${key}`);
  } catch (e) {
    console.log(`⚠️  Store failed: ${e}`);
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────
function showStats() {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    let total = 0, recents: any[] = [];
    try {
      total = (mem.query("SELECT COUNT(*) as c FROM facts WHERE entity LIKE 'autoloop%'").get() as any)?.c ?? 0;
      recents = mem.query("SELECT entity, key, value, created_at FROM facts WHERE entity LIKE 'autoloop%' ORDER BY created_at DESC LIMIT 5").all() as any[];
      mem.close();
    } catch {
      mem.close();
      console.log("⚠️  Memory DB not initialized");
      return;
    }
    console.log(`📈 Autoloop Experiment Stats`);
    console.log(`   Total experiments: ${total}`);
    console.log(`\n🕐 Recent:`);
    if (recents.length === 0) { console.log("   (none — store experiments with --store to populate)"); return; }
    for (const e of recents) {
      const d = e.created_at ? new Date(e.created_at * 1000).toLocaleDateString() : "?";
      console.log(`   ${e.entity} (${d}) — ${e.key}: ${e.value}`);
    }
  } catch {
    console.log("⚠️  Memory DB not initialized");
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--stats")) { showStats(); return; }
  if (args.includes("--store")) {
    const idx = args.indexOf("--store") + 1;
    const path = args[idx];
    if (!path) { console.log("Usage: --store <experiment.json>"); return; }
    const data = JSON.parse(await Bun.file(path).text());
    await storeExperiment(data);
    return;
  }
  const query = args.find((a) => !a.startsWith("--")) ?? "optimize";
  await queryExperiments(query);
}

main().catch(console.error);
