# SPEC: Zouroboros RAG Expansion

## Context

The `zo-memory-system` provides a hybrid SQLite + vector search memory layer. It currently serves the memory gate for chat context injection. Five adjacent Zouroboros components could benefit from the same RAG backbone but don't yet tap it.

## What This Project Does

Implements RAG retrieval into 5 target areas using the existing `zo-memory-system` as the retrieval engine.

---

## 1. Swarm Orchestrator Memory

### Trigger
After a swarm run completes, or on-demand via `--query`.

### Retrieval
- **Procedures**: Query `procedures` table for similar `task` patterns → inject outcome history
- **Episodes**: Query `episodes` table for same entity/dag → inject recent run context
- **Executor history**: Query cognitive profiles for per-executor failure patterns

### Output
Appends a `memoryContext` block to the swarm prompt:
```
[Recent similar procedures — 2 hits]
• site-review → timeout (3x) — avoid for multi-page crawls
• image-optimization → success — good fit for this executor

[Recent episodes — 1 hit]
• ffb-seo-audit (entity=swarm.ffb, 2026-03-25) — 4/6 tasks succeeded
```

### Implementation
- `scripts/swarm-memory.ts` — runs post-swarm and query modes
- Hybrid query (vector + FTS) via RRF fusion
- Episode + procedure storage
- Graceful fallback if memory.db missing

### Usage
```bash
# Query before routing
bun scripts/swarm-memory.ts --query "site review"

# Capture after swarm run
bun scripts/swarm-memory.ts --post-swarm ~/.swarm/results/swarm_xxx.json
```

---

## 2. Vault Semantic Search

### Trigger
User queries vault with `--semantic` flag or natural language.

### Retrieval
- Embed query via `nomic-embed-text`
- Vector similarity over vault markdown content
- RRF fusion with existing wikilink graph neighbors

### Output
Augmented vault CLI results:
```
$ vault-hybrid.ts query "supplier pricing decisions"

[Semantic — 3 hits, score 0.82]
  → Notes/FFB/supplier-matrix.md  (0.91)
  → Projects/jhh-finance/cfee-tracker.ts  (0.74)
  → Skills/ffb-ops-sop/...        (0.71)

[Graph neighbors — 2 hits]
  ← Notes/FFB/vendor-contracts.md
  ← Notes/FFB/sku-canon.md
```

### Implementation
- `scripts/vault-hybrid.ts` — semantic, hybrid, index, stats modes
- RRF fusion of vector + wikilink graph neighbors
- Markdown file indexing with content hashing
- Graceful fallback if vault DB not initialized

### Usage
```bash
# Index all vault files
bun scripts/vault-hybrid.ts index --full

# Semantic search
bun scripts/vault-hybrid.ts --semantic "authentication flow"

# Hybrid (semantic + graph)
bun scripts/vault-hybrid.ts --hybrid "supplier matrix"
```

---

## 3. Autoloop Experiment Memory

### Trigger
On `autoloop.ts` startup, before reading `program.md`.

### Retrieval
- Query `experiments` table for same optimization `target`
- Retrieve: previous iterations, hyperparameters tried, metric deltas

### Output
Injected into program context:
```
[Prior experiments for target=pagespeed-mobile]
• run-2026-03-20: target=pagespeed, metric=lighthouse-score, delta=+12
  → Tried: lazy-load images, removed unused CSS
• run-2026-03-15: target=pagespeed-mobile, metric=FCP, delta=+3
  → Tried: font-display:swap, critical CSS inlining
```

### Implementation
- `scripts/autoloop-memory.ts` — query, store, stats modes
- Experiment table with target/metric/delta/result
- Graceful degradation on empty DB

### Usage
```bash
# Query before running
bun scripts/autoloop-memory.ts --query "compression middleware"

# Store after completion
bun scripts/autoloop-memory.ts --store ~/.autoloop/runs/xxx.json
```

---

## 4. Three-Stage Eval Memory

### Trigger
Before each eval phase (mechanical, semantic, consensus).

### Retrieval
- **Prior evals**: Same file path or same acceptance criteria
- **AC templates**: Domain-specific acceptance criteria patterns

### Output
Injected into eval judge prompt:
```
[Prior eval for /server/api/users.ts]
• 2026-03-22: mechanical=FAIL — missing null check
• 2026-03-18: semantic=PASS

[AC template: API endpoint]
✓ Input validation on all parameters
✓ Error handling returns structured JSON
✓ Auth check at handler entry
```

### Implementation
- `scripts/eval-memory.ts` — prior, template, store, stats modes
- 8 seeded AC templates (react, api, frontend, general)
- Eval results cross-referenced into facts table
- Graceful degradation on empty DB

### Usage
```bash
# Get prior evals for a file
bun scripts/eval-memory.ts --prior /path/to/file.ts

# Get AC template for domain
bun scripts/eval-memory.ts --template "react"

# Store eval result
bun scripts/eval-memory.ts --store ~/.three-stage-eval/results/xxx.json
```

---

## 5. Persona Memory Gate

### Trigger
On conversation start, when active persona != excluded list.

### Retrieval
- Domain-specific facts via hybrid query
- Project conventions via FTS5 exact match

### Output
Injected into system prompt context block:
```
[Frontend Developer — domain facts]
• FFB brand voice: educational, scientific, avoid hard-sell
• Primary stack: React + Tailwind, Zo Space managed pages
• Code style: functional components, no class components

[Project conventions — 3 hits]
• Always include prop-types or TypeScript interfaces
• API routes go in /api/ subdirectory
• Tests required for new utility functions
```

### Implementation
- `scripts/persona-memory-gate.ts` — persona, domains modes
- 9 persona domain mappings
- Excludes claude-code, gemini-cli, hermes, codex
- Graceful "no context found" output

### Usage
```bash
# Get context for persona
bun scripts/persona-memory-gate.ts --persona "growth-hacker"

# List all persona domains
bun scripts/persona-memory-gate.ts --domains
```

---

## Unified Daily Maintenance (Recommended)

Rather than running area-specific scripts after each operation, use a single daily scheduled agent that captures everything.

### Script
- `scripts/daily-rag-maintenance.ts` — Maintains all 4 areas in one run

### What It Does
1. **Swarm**: Scans `~/.swarm/results/` and captures any missed episodes
2. **Autoloop**: Scans `~/.autoloop/runs/` and stores experiment results
3. **Evals**: Scans `~/.three-stage-eval/results/` and archives outcomes
4. **Vault**: Re-indexes for new/modified files in scoped directories

### Setup
```bash
# See agent creation command
bun scripts/daily-rag-maintenance.ts setup

# Or create manually at [Settings > Automations](/?t=automations):
#   Label: daily-rag-maintenance
#   Schedule: Daily at 02:00
#   Command: cd /home/workspace/Projects/zouroboros-rag-expansion && bun scripts/daily-rag-maintenance.ts run
```

### Manual Run
```bash
bun scripts/daily-rag-maintenance.ts run
```

### Status Check
```bash
bun scripts/daily-rag-maintenance.ts status
```

### Schedule
- **Frequency**: Daily
- **Time**: 02:00 (2 AM)
- **Timezone**: System local time
- **Log**: `~/.z/logs/daily-rag-maintenance.log`

---

## Configuration

### RAG Config Tuning

Each area has configurable fusion weights and top-k in `data/rag-config.db`:

| Area | Fusion Weight | Top-K | Purpose |
|------|--------------|-------|---------|
| Swarm procedures | 0.6 | 3 | Blend episodes + graph |
| Swarm executor health | 0.5 | 3 | Health + history fusion |
| Vault search | 0.7 | 5 | Strong semantic preference |
| Autoloop experiments | 0.5 | 3 | Recall similar runs |
| Eval templates | 0.4 | 3 | Prior AC retrieval |
| Persona injection | 0.3 | 5 | Broader context sweep |

### Re-seed Configs
```bash
bun scripts/seed-rag-config.ts
```

---

## Non-Functional Requirements

| Requirement | Target | Status |
|-------------|--------|--------|
| Retrieval latency | < 500ms per query | ✅ Met (requires populated memory.db) |
| Token budget | Configurable max, default 512 tokens | ✅ Config stored in rag-config.db |
| Graceful degradation | Fallback to non-RAG if Ollama/memory.db unavailable | ✅ All scripts handle empty DB |
| Test coverage | Smoke tests for each integration point | ✅ All 7 scripts compile and run |

---

## Dependencies

- `zo-memory-system` v3+ (memory.db with facts, embeddings, episodes, procedures)
- Ollama with `nomic-embed-text` (vector embeddings) and `qwen2.5:1.5b` (HyDE)
- `zo-swarm-orchestrator` v4.5+ (procedure/episode hooks)
- Bun 1.2+ or Node.js 20+

---

## Acceptance Criteria — Implementation Status

### ✅ Swarm Orchestrator Memory
- [x] `swarm-memory.ts` — runs post-swarm and query modes
- [x] Hybrid query (vector + FTS) via RRF fusion
- [x] Episode + procedure storage
- [x] Graceful fallback if memory.db missing

### ✅ Vault Semantic Search
- [x] `vault-hybrid.ts` — semantic, hybrid, index, stats modes
- [x] RRF fusion of vector + wikilink graph neighbors
- [x] Markdown file indexing with content hashing
- [x] Graceful fallback if vault DB not initialized

### ✅ Autoloop Experiment Memory
- [x] `autoloop-memory.ts` — query, store, stats modes
- [x] Experiment table with target/metric/delta/result
- [x] Graceful degradation on empty DB

### ✅ Three-Stage Eval Memory
- [x] `eval-memory.ts` — prior, template, store, stats modes
- [x] 8 seeded AC templates (react, api, frontend, general)
- [x] Eval results cross-referenced into facts table
- [x] Graceful degradation on empty DB

### ✅ Persona Memory Gate
- [x] `persona-memory-gate.ts` — persona, domains modes
- [x] 9 persona domain mappings
- [x] Excludes claude-code, gemini-cli, hermes, codex
- [x] Graceful "no context found" output

### ✅ Config Layer
- [x] `rag-config.db` with 9 seeded configs
- [x] Per-area fusion weights and top_k
- [x] Enabled/disabled toggle per config

### ✅ Unified Daily Maintenance
- [x] `daily-rag-maintenance.ts` — single script maintains all 4 areas
- [x] Deduplication (checks before capture)
- [x] Logging to `~/.z/logs/daily-rag-maintenance.log`
- [x] `setup`, `run`, `status` subcommands

### ✅ Non-Functional
- [x] All 7 scripts compile (bun build)
- [x] All scripts pass smoke tests (no crashes on empty DB)
- [x] Graceful degradation with warning messages
- [x] Retrieval latency < 500ms (tested with populated memory.db)
- [x] Token budget enforcement (configurable in rag-config.db)

---

## System State

| Component | Value |
|-----------|-------|
| Facts in memory | 5,387 |
| Swarm episodes | 104 |
| Vault files indexed | 345 |
| Wikilinks tracked | 11,506 |
| Daily maintenance | ✅ Ready to set up |

---

## Quick Reference

| Task | Command |
|------|---------|
| Setup daily maintenance | `bun scripts/daily-rag-maintenance.ts setup` |
| Run maintenance now | `bun scripts/daily-rag-maintenance.ts run` |
| Check status | `bun scripts/daily-rag-maintenance.ts status` |
| Query swarm memory | `bun scripts/swarm-memory.ts --query "task description"` |
| Semantic vault search | `bun scripts/vault-hybrid.ts --semantic "query"` |
| Hybrid vault search | `bun scripts/vault-hybrid.ts --hybrid "query"` |
| Query autoloop | `bun scripts/autoloop-memory.ts --query "target"` |
| Get AC template | `bun scripts/eval-memory.ts --template "react"` |
| Persona context | `bun scripts/persona-memory-gate.ts --persona "slug"` |
| Re-seed configs | `bun scripts/seed-rag-config.ts` |
