#!/usr/bin/env bun
/**
 * rag-swarm-retrieval.ts — Swarm orchestrator RAG integration via zo-memory-system.
 * (Consolidated from Projects/zouroboros-rag-expansion into zouroboros monorepo)
 * Usage:
 *   bun rag-swarm-retrieval.ts --post-swarm <id>   Store episode + procedures
 *   bun rag-swarm-retrieval.ts --query "task desc"  Retrieve relevant context
 *   bun rag-swarm-retrieval.ts --stats              Show retrieval stats
 */

import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DB  = "/home/workspace/.zo/memory/shared-facts.db";
const CONFIG_DB  = resolve(__dirname, "../data/rag-config.db");
const EPISODES_DIR = "/dev/shm";

// ── CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i+1] ?? null : null; };
const mode = args.includes("--post-swarm") ? "post"
           : args.includes("--query")       ? "query"
           : args.includes("--stats")       ? "stats" : "usage";

// ── Ollama embed (HTTP API) ───────────────────────────────────────
async function embed(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  const d = await res.json() as { embedding?: number[] };
  if (!d.embedding) throw new Error("No embedding returned from Ollama");
  return d.embedding;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-10);
}

// ── Semantic search (fact_embeddings binary) ─────────────────────
async function semanticSearch(query: string, topK = 5): Promise<any[]> {
  const mem = new Database(MEMORY_DB, { readonly: true });
  const qv = await embed(query);

  const embRows = mem
    .query(`SELECT fe.fact_id, fe.embedding FROM fact_embeddings fe
            WHERE fe.fact_id IN (SELECT id FROM facts WHERE entity LIKE 'swarm%')`)
    .all() as Array<{ fact_id: string; embedding: Buffer }>;

  const factMap = new Map<string, { id:string; entity:string; key:string; value:string }>();
  for (const f of mem.query(`SELECT id, entity, key, value FROM facts WHERE entity LIKE 'swarm%'`).all() as Array<{id:string;entity:string;key:string;value:string}>) {
    factMap.set(f.id, f);
  }
  mem.close();

  return embRows
    .map(r => ({ fact: factMap.get(r.fact_id), score: cosineSim(qv,
      Array.from(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength/4))) }))
    .filter(r => isFinite(r.score) && r.score > 0.5)
    .sort((a,b) => b.score - a.score).slice(0, topK);
}

// ── Store episode ────────────────────────────────────────────────
async function storeEpisode(id: string) {
  const path = `${EPISODES_DIR}/${id}-complete.json`;
  if (!await Bun.file(path).exists()) { console.error(`❌ Not found: ${path}`); process.exit(1); }
  const data = await Bun.file(path).json();
  const { tasks=[], startedAt, completedAt } = data;

  const db = new Database(MEMORY_DB);
  db.run(
    `INSERT OR REPLACE INTO episodes (id,entity,task_summary,task_count,success_count,started_at,completed_at,metadata)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, data.entity ?? `swarm.${id.split("-")[0]}`,
     tasks.map((t:any) => t.task?.slice(0,80) ?? "?").join(" | "),
     tasks.length, tasks.filter((t:any) => t.status==="success").length,
     startedAt ?? null, completedAt ?? null, JSON.stringify({tasks})]);
  db.close();
  console.log(`✅ Episode stored: ${id} (${tasks.length} tasks)`);
}

// ── Store procedure ───────────────────────────────────────────────
function storeProc(swarmId: string, task: any) {
  const db = new Database(MEMORY_DB);
  db.run(
    `INSERT OR REPLACE INTO procedures (id,entity,description,outcome,executor_used,recorded_at,metadata)
     VALUES (?,?,?,?,?,?,?)`,
    [`${swarmId}-${task.id ?? Date.now()}`, task.entity ?? "swarm.unknown", task.task ?? "",
     task.status==="success" ? "success" : task.status ?? "unknown",
     task.executor ?? "unknown", new Date().toISOString(), JSON.stringify({swarmId, ...task})]);
  db.close();
}

// ── Query episodes ───────────────────────────────────────────────
async function queryEpisodes(query: string, topK=3): Promise<any[]> {
  try {
    const mem = new Database(MEMORY_DB, { readonly: true });
    const kw = query.split(" ")[0];
    const rows = mem
      .query(`SELECT id,entity,task_summary,task_count,success_count,completed_at FROM episodes
               WHERE task_summary LIKE ?1 OR entity LIKE ?1 ORDER BY completed_at DESC LIMIT ?2`)
      .all(`%${kw}%`, topK);
    mem.close();
    return rows as any[];
  } catch { return []; }
}

// ── Stats ──────────────────────────────────────────────────────────
function showStats() {
  let epCount = 0, procCount = 0, recent: any[] = [];
  let warn = false;

  const mem = new Database(MEMORY_DB, { readonly: true });
  try {
    epCount   = (mem.query("SELECT COUNT(*) as c FROM episodes").get() as any)?.c ?? 0;
    procCount = (mem.query("SELECT COUNT(*) as c FROM procedures").get() as any)?.c ?? 0;
    recent    = mem.query("SELECT entity,task_count,success_count,completed_at FROM episodes ORDER BY completed_at DESC LIMIT 5").all() as any[];
  } catch { warn = true; }
  mem.close();

  const cfg = new Database(CONFIG_DB, { readonly: true });
  const cfgCount = (cfg.query("SELECT COUNT(*) as c FROM rag_configs WHERE enabled=1").get() as any)?.c ?? 0;
  cfg.close();

  if (warn) console.log("⚠️  Some memory tables missing (run zo-memory-system setup)");
  console.log(`📊 Swarm Memory RAG Stats`);
  console.log(`   Episodes stored:    ${epCount}`);
  console.log(`   Procedures stored: ${procCount}`);
  console.log(`   Active RAG configs: ${cfgCount}`);
  console.log(`\n🕐 Recent episodes:`);
  if (recent.length === 0) console.log(`   (none — run a swarm with --post-swarm to populate)`);
  else for (const e of recent) {
    const d = e.completed_at ? new Date(e.completed_at).toLocaleDateString() : "?";
    console.log(`   ${e.entity} (${d}) — ${e.success_count ?? "?"}/${e.task_count ?? "?"}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  switch (mode) {
    case "post": {
      await storeEpisode(getArg("--post-swarm")!);
      const data = await Bun.file(`${EPISODES_DIR}/${getArg("--post-swarm")}.json`).json();
      for (const t of data.tasks ?? []) storeProc(getArg("--post-swarm")!, t);
      console.log("✅ Procedures stored");
      break;
    }
    case "query": {
      const [procs, eps] = await Promise.all([semanticSearch(getArg("--query")!, 3), queryEpisodes(getArg("--query")!, 3)]);
      const lines: string[] = [];
      if (procs.length > 0) {
        lines.push("[Recent similar procedures]");
        for (const p of procs) lines.push(`  • ${(p.fact?.value ?? "").slice(0,70)} → ${p.fact?.key ?? ""}`);
        lines.push("");
      }
      if (eps.length > 0) {
        lines.push("[Recent episodes]");
        for (const e of eps) {
          const d = e.completed_at ? new Date(e.completed_at).toLocaleDateString() : "?";
          lines.push(`  • ${e.entity} (${d}) — ${e.success_count ?? "?"}/${e.task_count ?? "?"} succeeded`);
        }
      }
      console.log(lines.join("\n"));
      break;
    }
    case "stats": { showStats(); break; }
    default: {
      console.log(`Usage:\n  bun swarm-memory.ts --post-swarm <id>  Store episode + procedures\n  bun swarm-memory.ts --query "task desc"       Retrieve relevant context\n  bun swarm-memory.ts --stats                   Show retrieval stats`);
    }
  }
}

main().catch(console.error);
