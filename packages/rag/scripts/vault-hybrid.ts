#!/usr/bin/env bun
/**
 * vault-hybrid.ts
 *
 * Augments the vault.ts wikilink graph search with semantic vector search.
 * Combines RRF fusion of embeddings + graph neighbors for richer results.
 *
 * Usage:
 *   bun vault-hybrid.ts query --semantic "query text"
 *   bun vault-hybrid.ts query --hybrid "query text"  (graph + semantic)
 *   bun vault-hybrid.ts index [--full]               Re-index vault files
 *   bun vault-hybrid.ts stats
 */

import { Database } from "bun:sqlite";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DB = "/home/workspace/.zo/memory/shared-facts.db";
const VAULT_DB = "/home/workspace/.zo/memory/shared-facts.db";
const VAULT_ROOT = "/home/workspace";

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0] ?? "usage";
const semanticIdx = args.indexOf("--semantic");
const hybridIdx = args.indexOf("--hybrid");
const queryStr = semanticIdx !== -1 ? args[semanticIdx + 1] : hybridIdx !== -1 ? args[hybridIdx + 1] : null;
const fullIdx = args.indexOf("--full");
const mode = cmd === "index" ? "index" : semanticIdx !== -1 ? "semantic" : hybridIdx !== -1 ? "hybrid" : "graph-only";

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

// ── RRF fusion ─────────────────────────────────────────────────────
function rrfFusion(resultSets: Array<{ id: string; file: string; score: number; rank: number }[]>, k = 60) {
  const seen = new Map<string, any>();

  resultSets.forEach((rs) => {
    rs.forEach((item, rank) => {
      const prev = seen.get(item.id);
      const rrfScore = prev ? prev.rrf + 1 / (k + rank + 1) : 1 / (k + rank + 1);
      seen.set(item.id, {
        ...item,
        rrf: rrfScore,
        sources: prev ? [...prev.sources, item.rank] : [item.rank],
      });
    });
  });

  return Array.from(seen.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, 8);
}

// ── Index vault files ────────────────────────────────────────────────
async function indexVaultFiles(full = false) {
  const db = new Database(VAULT_DB);

  db.run(`
    CREATE TABLE IF NOT EXISTS vault_embeddings (
      file_path TEXT PRIMARY KEY,
      content_hash TEXT,
      last_modified TEXT,
      embedding_id TEXT,
      embedding_json TEXT
    )
  `);

  // Scope to high-value project directories (not full workspace)
  const searchRoots = [
    "/home/workspace/Skills",
    "/home/workspace/Notes",
    "/home/workspace/Zouroboros",
    "/home/workspace/Projects",
    "/home/workspace/FFB_Canon",
  ];

  const allFiles: string[] = [];
  for (const root of searchRoots) {
    collectMarkdownFiles(root, allFiles);
  }

  let indexed = 0;
  let skipped = 0;

  for (const file of allFiles) {
    const stat = statSync(file);
    const content = readFileSync(file, "utf-8").slice(0, 8000);
    const hash = simpleHash(content);

    const existing = db
      .query("SELECT content_hash FROM vault_embeddings WHERE file_path = ?")
      .get(file) as any;

    if (!full && existing && existing.content_hash === hash) {
      skipped++;
      continue;
    }

    try {
      const vec = await embed(content);
      db.run(
        "INSERT OR REPLACE INTO vault_embeddings (file_path, content_hash, last_modified, embedding_json) VALUES (?, ?, ?, ?)",
        [file, hash, stat.mtime.toISOString(), JSON.stringify(vec)]
      );
      indexed++;
      if (indexed % 20 === 0) process.stderr.write(`Indexed ${indexed}...\n`);
    } catch (e) {
      console.warn(`⚠️  Failed to index ${file}: ${e}`);
    }
  }

  db.close();
  console.log(`✅ Indexed ${indexed} files (${skipped} unchanged)`);
}

function collectMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "Trash" || entry === ".zo") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectMarkdownFiles(full, files);
    } else if (full.endsWith(".md") || full.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// ── Semantic search ─────────────────────────────────────────────────
async function semanticSearch(query: string, topK = 5) {
  const vaultDb = new Database(VAULT_DB, { readonly: true });
  const qVec = await embed(query);

  // Load all indexed files
  const rows = vaultDb
    .query("SELECT file_path, embedding_json FROM vault_embeddings WHERE embedding_json IS NOT NULL")
    .all() as any[];

  vaultDb.close();

  // In-process cosine similarity
  const scored = rows
    .map((r) => {
      const vec = JSON.parse(r.embedding_json as string) as number[];
      const score = cosineSim(qVec, vec);
      return { id: r.file_path, file: r.file_path.replace(VAULT_ROOT + "/", ""), score, rank: 0 };
    })
    .filter((r) => isFinite(r.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r, i) => ({ ...r, rank: i }));

  return scored;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ── Graph neighbors ─────────────────────────────────────────────────
async function graphNeighbors(filePath: string, depth = 2): Promise<any[]> {
  const vaultDb = new Database(VAULT_DB, { readonly: true });

  // wikilinks table structure from vault-schema.ts
  const rows = vaultDb
    .query(
      `SELECT DISTINCT target_id FROM vault_links WHERE source_id = ?
       UNION
       SELECT DISTINCT source_id FROM vault_links WHERE target_id = ?
       LIMIT :k`
    )
    .all({ "0": filePath, "1": filePath, k: 5 }) as any[];

  vaultDb.close();
  return rows;
}

// ── Hybrid search (semantic + graph) ────────────────────────────────
async function hybridSearch(query: string, topK = 5) {
  const [semanticResults, graphResults] = await Promise.all([
    semanticSearch(query, topK * 2),
    // For graph: find matching files by name/link
    (async () => {
      const vaultDb = new Database(VAULT_DB, { readonly: true });
      const keyword = query.split(" ").slice(0, 2).join(" ");
      const rows = vaultDb
        .query(
          `SELECT DISTINCT file_path, 0.5 AS score, 0 AS rank
           FROM vault_embeddings
           WHERE file_path IN (
             SELECT DISTINCT source_id FROM vault_links WHERE target_id LIKE :k
             UNION
             SELECT DISTINCT target_id FROM vault_links WHERE source_id LIKE :k
           )
           LIMIT :limit`
        )
        .all({ k: `%${keyword}%`, limit: topK }) as any[];
      vaultDb.close();
      return rows.map((r) => ({ id: r.file_path, file: r.file_path.replace(VAULT_ROOT + "/", ""), score: r.score, rank: r.rank }));
    })(),
  ]);

  const fused = rrfFusion([semanticResults, graphResults]);
  return fused.slice(0, topK);
}

// ── Stats ────────────────────────────────────────────────────────────
function showStats() {
  try {
    const vaultDb = new Database(VAULT_DB, { readonly: true });
    const embCount = (vaultDb.query("SELECT COUNT(*) as c FROM vault_embeddings").get() as any)?.c ?? 0;
    const linkCount = (vaultDb.query("SELECT COUNT(*) as c FROM vault_links").get() as any)?.c ?? 0;
    const orphanCount = (vaultDb.query("SELECT COUNT(*) as c FROM vault_embeddings ve WHERE NOT EXISTS (SELECT 1 FROM vault_links w WHERE w.source_id = ve.file_path OR w.target_id = ve.file_path)").get() as any)?.c ?? 0;
    vaultDb.close();

    console.log(`📚 Vault RAG Stats`);
    console.log(`   Files indexed:     ${embCount}`);
    console.log(`   Wikilinks:         ${linkCount}`);
    console.log(`   Orphan files:      ${orphanCount}`);
  } catch {
    console.warn("⚠️  Vault DB not accessible (run 'bun vault-hybrid.ts index' first)");
    console.log(`📚 Vault RAG Stats`);
    console.log(`   Files indexed:     0`);
    console.log(`   Wikilinks:         0`);
    console.log(`   Orphan files:      0`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  switch (mode) {
    case "index": {
      await indexVaultFiles(fullIdx !== -1);
      break;
    }

    case "semantic": {
      const results = await semanticSearch(queryStr!, 5);
      console.log(`\n🔍 Semantic search: "${queryStr}"\n`);
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.file}`);
      });
      break;
    }

    case "hybrid": {
      const results = await hybridSearch(queryStr!, 5);
      console.log(`\n🔗 Hybrid search: "${queryStr}"\n`);
      results.forEach((r: any, i: number) => {
        const src = r.sources?.join(", ") ?? "-";
        console.log(`  ${i + 1}. [RRF ${(r.rrf * 100).toFixed(1)}%] ${r.file} (sources: ${src})`);
      });
      break;
    }

    default: {
      showStats();
      console.log(`\nUsage:
  bun vault-hybrid.ts --semantic "query text"    Pure vector search
  bun vault-hybrid.ts --hybrid "query text"      Vector + graph fusion
  bun vault-hybrid.ts index [--full]             Index vault files
  bun vault-hybrid.ts stats                      Show vault stats`);
    }
  }
}

main().catch(console.error);
