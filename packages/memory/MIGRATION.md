# MEM-201: Vector DB Migration Guide

## Current Architecture

The memory system stores embeddings as `Float32Array` BLOBs in SQLite (`fact_embeddings` table) and performs brute-force cosine similarity scans for vector search. This works well up to ~5,000 facts.

## When to Migrate

| Fact Count | Status | Action |
|-----------|--------|--------|
| < 2,500 | OK | No action needed |
| 2,500 - 5,000 | Early warning | Monitor query latency P95 |
| 5,000 - 10,000 | Recommended | Plan migration to sqlite-vec |
| > 10,000 | Urgent | Brute-force scan > 100ms; migrate immediately |

The `zouroboros doctor` command reports current scale status under "Vector Scale".

## Recommended Migration Path: sqlite-vec

[sqlite-vec](https://github.com/asg017/sqlite-vec) is the recommended first migration target because it:

- **Preserves local-first architecture** — no external database server required
- **Uses HNSW indexing** — approximate nearest neighbor search, ~10-50x faster at 10k+ facts
- **SQLite extension** — WASM-compatible, loads into existing bun:sqlite
- **Zero schema change** — embeddings stay in SQLite, just indexed differently

### Migration Steps (when threshold is reached)

1. **Install sqlite-vec**
   ```bash
   bun add sqlite-vec
   ```

2. **Create VectorStore abstraction** in `packages/memory/src/vector-store.ts`:
   ```typescript
   export interface VectorStore {
     index(factId: string, embedding: number[]): Promise<void>;
     search(query: number[], topK: number): Promise<Array<{ factId: string; score: number }>>;
     remove(factId: string): Promise<void>;
     count(): number;
   }
   ```

3. **Implement SqliteVecStore** using the extension:
   ```typescript
   import * as sqliteVec from 'sqlite-vec';

   export class SqliteVecStore implements VectorStore {
     constructor(db: Database) {
       sqliteVec.load(db);
       db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(embedding float[768])`);
     }
     // ... implement interface methods
   }
   ```

4. **Run data migration** — read all `fact_embeddings` rows, insert into `vec_facts` virtual table

5. **Swap search path** — replace brute-force scan in `searchFactsVector()` with `VectorStore.search()`

### Estimated Effort

3-5 days including tests, benchmarks, and backward compatibility.

## Future Options (10k+ facts)

If sqlite-vec proves insufficient at very large scale (50k+ facts), consider:

| Option | Pros | Cons |
|--------|------|------|
| **LanceDB** | HNSW + DiskANN, local-first, Apache 2.0 | Requires FFI/subprocess, not pure JS |
| **pgvector** | Production-proven, SQL interface | Requires PostgreSQL server (not local-first) |
| **Qdrant** | Purpose-built vector DB, gRPC API | External service, operational overhead |

The `VectorStore` interface abstraction (step 2 above) makes swapping backends a 1-day effort once it exists.

## Monitoring

Track these metrics via `zouroboros doctor` and `packages/memory/src/metrics.ts`:
- Fact count (primary threshold trigger)
- Embedding count
- DB file size
- Search latency P50/P95 (via `recordSearchOperation()`)
