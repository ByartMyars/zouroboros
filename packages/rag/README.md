# zouroboros-rag

Retrieval-Augmented Generation for the Zouroboros ecosystem. Provides context injection across 5 areas: swarm orchestration, vault search, autoloop experiments, three-stage eval, and persona memory.

> Consolidated from `Projects/zouroboros-rag-expansion/` into the Zouroboros monorepo (2026-04-01).

## Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `rag-swarm-retrieval.ts` | Episode/procedure retrieval for swarm routing | `bun scripts/rag-swarm-retrieval.ts --query "site review"` |
| `vault-hybrid.ts` | Semantic + wikilink graph RRF fusion search | `bun scripts/vault-hybrid.ts --hybrid "query"` |
| `autoloop-memory.ts` | Experiment history recall for autoloop | `bun scripts/autoloop-memory.ts --query "optimize"` |
| `eval-memory.ts` | Prior eval results and AC templates | `bun scripts/eval-memory.ts --prior /path/to/file.ts` |
| `persona-memory-gate.ts` | Domain fact injection per persona | `bun scripts/persona-memory-gate.ts --persona "Alaric"` |
| `seed-rag-config.ts` | Initialize config DB with 9 RAG configs | `bun scripts/seed-rag-config.ts` |
| `daily-rag-maintenance.ts` | Unified daily maintenance for all 4 areas | `bun scripts/daily-rag-maintenance.ts run` |

## Quick Start

```bash
cd packages/rag

# Initialize config DB
bun scripts/seed-rag-config.ts

# Index vault files
bun scripts/vault-hybrid.ts index

# Run daily maintenance
bun scripts/daily-rag-maintenance.ts run

# Check status
bun scripts/daily-rag-maintenance.ts status
```

## Dependencies

- **zo-memory-system**: Shared facts DB at `~/.zo/memory/shared-facts.db`
- **Ollama**: Local embeddings via `nomic-embed-text` at `localhost:11434`
- **Bun**: Runtime (1.2+)

## System State

| Metric | Value |
|--------|-------|
| Facts in memory | 5,387 |
| Swarm episodes | 104 |
| Vault files indexed | 345 |
| Wikilinks tracked | 11,506 |

## Architecture

```
packages/rag/
├── src/index.ts              # Type exports
├── scripts/                  # CLI tools (7 scripts)
├── data/rag-config.db        # SQLite config (9 configs)
└── SPEC.md                   # Full technical specification
```

All scripts use `bun:sqlite` for DB access and Ollama HTTP API for embeddings. No external npm dependencies required.
