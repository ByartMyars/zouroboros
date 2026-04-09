# @zouroboros/bench

Custom benchmarks for Zouroboros-specific capabilities that no existing memory benchmark covers.

## ZouroBench

Tests three core differentiators:

| Category | What it tests | Questions |
|---|---|---|
| **Procedural Recall** | Step recall, evolution tracking, episode linking, cross-procedure queries | 15 |
| **Cross-Persona Transfer** | Pool access, inheritance chains, access denial, multi-source aggregation | 15 |
| **Swarm Context Propagation** | Dependency context flow, artifact tracking, DAG structure, role analysis | 15 |

### Run

```bash
bun run adapters/zourobench-adapter.ts \
  --dataset data/zourobench/seed.json \
  --output data/runs/ \
  --judge \
  --judge-model gpt-4o
```

Requires `OPENAI_API_KEY` for GPT-4o judge and gpt-4o-mini answer generation. Falls back to local Ollama if unavailable.

### Scores (v1.0)

| Category | Score |
|---|---|
| Procedural Recall | 93–100% |
| Cross-Persona Transfer | 100% |
| Swarm Context Propagation | 100% |
| **Overall (5-run avg)** | **97.8%** |

### Seed Data

`data/zourobench/seed.json` contains 7 procedures (with versioning), 12 episodes, 28 facts across 6 personas, 3 swarm DAGs with 16 tasks, and 4 knowledge pools with inheritance chains.
