# Swarm Orchestrator Enhancement Backlog

> Strategic backlog for zo-swarm-orchestrator evolution. Items are prioritized by impact, effort, and alignment with the Zouroboros local-first, learning-oriented philosophy.

---

## Quick Reference

| Priority | Meaning | SLA Target |
|----------|---------|------------|
| **P0-Critical** | Blocks production, fix immediately | 24h |
| **P1-High** | Significant improvement, schedule next sprint | 1-2 weeks |
| **P2-Medium** | Nice-to-have, backlog for capacity | 1-2 months |
| **P3-Low** | Future consideration, monitor triggers | 3+ months |

---

## Active Queue

### P1-High: SWARM-bench Evaluation Harness (Docker-based)
**Status**: ✅ Done (2026-03-31) — Implementation Complete  
**Effort**: Large (2-3 weeks)  
**Impact**: High — Empirical quality validation, executor benchmarking

**⚠️ DISTINCTION**: This is NOT the same as `scripts/benchmark.ts` (which exists and benchmarks memory strategies). SWARM-bench is a Docker-inspired evaluation harness for task quality validation.

**Description**:  
Implemented Docker-based evaluation harness adapted from SWE-bench methodology:
- ✅ `swarm-bench.ts` — Main harness orchestrator with CLI
- ✅ Benchmark dataset format (JSON) with AC schema
- ✅ Workspace isolation via temp directory + setup scripts
- ✅ AC verification engine (file_exists, content_match, test_pass, semantic_similarity, no_error)
- ✅ Ground truth comparison with Jaccard similarity scoring
- ✅ Cross-executor leaderboard with persistent rankings
- ✅ Per-instance result tracking with weighted AC scores
- ✅ CLI commands: init, run, verify, leaderboard, compare

**Files Created**:
- `scripts/swarm-bench.ts` — 800+ line implementation
- `~/.swarm/bench/datasets/` — Benchmark suite storage
- `~/.swarm/bench/results/` — Run results storage
- `~/.swarm/bench/leaderboard.json` — Executor rankings

**Usage**:
```bash
# Create new benchmark suite
bun swarm-bench.ts init my-validation

# Run benchmark with specific executor
bun swarm-bench.ts run my-validation.json --executor claude-code

# View detailed verification report
bun swarm-bench.ts verify ~/.swarm/bench/results/bench_xxx.json

# Show executor leaderboard
bun swarm-bench.ts leaderboard

# Compare two runs
bun swarm-bench.ts compare run1.json run2.json
```

**Sample Benchmark Instance**:
```json
{
  "id": "basic-file-creation",
  "name": "Create Configuration File",
  "difficulty": "trivial",
  "category": "coding",
  "task": "Create a file at /tmp/test-project/config.json...",
  "acceptance_criteria": [
    { "type": "file_exists", "path": "/tmp/test-project/config.json", "weight": 0.3 },
    { "type": "content_match", "file": "/tmp/test-project/config.json", 
      "contains": ["\"name\"", "\"version\""], "weight": 0.7 }
  ]
}
```

**Note**: Framework fully functional. Executor bridge configuration may need environment-specific tuning for production use.

**Next Steps**:
- Create comprehensive benchmark dataset (20-50 instances across all categories)
- Add Docker container isolation option (currently uses temp directories)
- Implement semantic similarity via Ollama embeddings

---

### P2-Medium: Dependency Cascade Mitigation
**Status**: ✅ Done (2026-03-31)  
**Effort**: Medium (1 week)  
**Impact**: High — 77.5% of swarm failures are cascade failures

**Description**:  
Implemented partial DAG recovery for cascade mitigation:
- ✅ Task-level `onDependencyFailure` policy field (`abort` | `degrade` | `retry` | `inherit`)
- ✅ Task type auto-classification (`analysis` | `mutation` | `hybrid` | `auto`)
- ✅ Degraded execution mode for analysis tasks (proceed with partial inputs + warning annotation)
- ✅ Partial input assembly from completed dependencies with confidence scoring
- ✅ Cascade event logging to zo-memory-system episodes
- ✅ Backward compatibility with existing `--no-cascade` flag
- ✅ Updated both `runDAGStreaming` and `runDAGWaves` execution modes

**Files Modified**:
- `scripts/orchestrate-v5.ts` — Core cascade mitigation implementation

**Usage**:
```json
{
  "id": "analyze-results",
  "persona": "analyst",
  "task": "Analyze the failed test output and recommend fixes",
  "dependsOn": ["run-tests"],
  "onDependencyFailure": "degrade",
  "taskType": "analysis"
}
```

**Results**: Analysis tasks can now proceed with partial inputs when root tasks fail, reducing cascade failure impact by allowing recovery workflows to continue.

---

### P2-Medium: AgentKV/CortexDB Evaluation for Memory Backend
**Status**: Proposed → Spike Required  
**Effort**: Medium-Large (2-3 weeks for evaluation + decision)  
**Impact**: High — Potential replacement for SQLite+Ollama stack

**Description**:  
Evaluate AgentKV (Python/C++) and CortexDB (Go) as potential backends for zo-memory-system. Both offer local-first, single-file graph+vector storage with better performance characteristics than current SQLite+FTS5+Ollama stack.

**Evaluation Criteria**:

| Criteria | Current (SQLite+Ollama) | AgentKV | CortexDB |
|----------|------------------------|---------|----------|
| Language | TypeScript/Bun | Python/C++ | Go |
| Storage | SQLite file | Single mmap'd file | SQLite-backed |
| Vector Search | Ollama (external) | HNSW (embedded) | HNSW (embedded) |
| Graph | Custom adjacency table | Property graph edges | Knowledge graph |
| BM25/FTS | FTS5 | No | FTS5 |
| Episodic Memory | Custom schema | No | Yes (hindsight) |
| Procedural Memory | Custom schema | No | Yes |
| Open Loops | Custom schema | No | Unknown |

**Recommended Path**:
1. **Spike (1 week)**: Build minimal TypeScript bindings for CortexDB (Go has good JS interop via WASM or gRPC)
2. **Benchmark (1 week)**: Compare ingestion, search latency, recall@k against current stack
3. **Decision**: Migrate if 2x+ performance improvement or significantly better graph capabilities

**Core Components**:
- `cortexdb-binding.ts` — TypeScript interface
- Feature parity matrix
- Migration script for existing zo-memory databases
- Performance benchmark suite

**Acceptance Criteria**:
- [ ] Functional TypeScript bindings for CortexDB
- [ ] Benchmark suite comparing current vs. CortexDB vs. AgentKV
- [ ] Decision document with migration plan or rejection rationale
- [ ] If accepted: migration path for existing users

**Dependencies**: None (evaluation only)  
**Rationale**: Current SQLite+Ollama stack works but has latency overhead (Ollama round-trip). Embedded vector+graph could reduce search latency from ~4s to <100ms, enabling real-time memory integration.

---

## Icebox (P3-Low)

### P3-Low: Heartbeat Token Limit for Bridge Executors
**Status**: Icebox — Monitor triggers  
**Added**: 2026-03-23  
**Effort**: Medium  
**Impact**: Low (no active incidents)

**Description**:  
Add bridge-level watchdog emitting periodic "alive + N tokens" signals to detect hung bridges before timeout and enforce per-task token budgets.

**Trigger to Revive**:
- Swarm tasks exceed 50K tokens per task
- Executor hangs >3 per week
- OmniRoute budget overruns from undetected runaway output

**Evidence**: Analyzed 62 swarm runs — zero runaway output incidents, only 1 hung task (10x outlier).

**Rationale**: Not justified by current failure patterns. Dependency cascade mitigation (P2) would have greater impact.

---

### P3-Low: Request Caching + Deduplication
**Status**: Icebox  
**Effort**: Small  
**Impact**: Medium (cost reduction)

**Description**:  
Cache identical task requests to avoid redundant execution. Add request queue with deduplication for concurrently submitted similar tasks.

**Trigger to Revive**:
- Observed duplicate task execution patterns
- Cost concerns from redundant API calls

---

### P3-Low: Visual Dashboard for Real-Time Monitoring
**Status**: Icebox  
**Effort**: Large  
**Impact**: Medium (UX improvement)

**Description**:  
Web dashboard showing active swarm runs, task progress, circuit breaker states, and historical success rates.

**Trigger to Revive**:
- Multiple concurrent swarm campaigns become common
- Users request better visibility into execution

---

## Completed Work ✅

### Agentic RAG SDK Integration (Documentation Retrieval)
**Status**: ✅ Done (2026-03-31)  
**File**: `scripts/rag-enrichment.ts`

**What Was Built**:
- Local-first RAG using Ollama (nomic-embed-text) + Qdrant
- 19 SDKs indexed: Claude SDK, LangChain, CrewAI, OpenAI Agents, ADK, LlamaIndex, Pydantic-AI, AutoGen, DSPy, Instructor, LangGraph, Semantic Kernel, Hono, MCP SDK, Qdrant, Bun, Drizzle ORM, Stripe, Airtable
- Auto-enrichment: Task prompts automatically enriched with top-3 relevant SDK patterns
- Keyword triggering: RAG only fires for tasks containing relevant keywords (agent, API, database, workflow, etc.)
- Graceful fallback: Non-blocking — if RAG fails, task proceeds normally
- Zero API costs: All local embeddings, no external API calls

**Integration**: Called from `buildOptimizedPrompt()` in `orchestrate-v5.ts`

**Why Not MattMagg/agentic-rag-sdk?** Built custom local-first solution instead of external MCP dependency. Better fits Zouroboros philosophy.

---

## Implementation Strategy (Updated)

### Phase 1: Validation Infrastructure (Weeks 1-3)
**Focus**: Build true SWARM-bench harness (Docker-based evaluation, not memory benchmark)

1. **Week 1**: Design benchmark format with AC schema, workspace isolation
2. **Week 2**: Implement AC verification engine, ground truth comparison
3. **Week 3**: Create initial benchmark dataset (10-20 instances), validate harness

**Deliverable**: Working SWARM-bench with baseline metrics for swarm task quality

---

### Phase 2: Cascade Mitigation Completion (Weeks 4-5)
**Focus**: Extend basic cascade-off to full partial DAG recovery

1. **Week 4**: Implement per-task `on_dependency_failure` policy, degraded execution mode
2. **Week 5**: Cascade event logging to memory, validate improvement via SWARM-bench

**Deliverable**: Cascade mitigation reducing failure rate by >20% (measured)

---

### Phase 3: Knowledge Infrastructure (Weeks 6-8)
**Focus**: Evaluate and optionally integrate better memory backends

1. **Week 6**: Spike CortexDB TypeScript bindings
2. **Week 7**: Build benchmark comparing current vs. CortexDB vs. AgentKV
3. **Week 8**: Decision + migration plan (if positive)

**Deliverable**: Decision document with benchmarks

---

## Decision Log (Updated)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-31 | ✅ Agentic RAG: Complete | Custom local-first implementation in `rag-enrichment.ts` — 19 SDKs, Ollama+Qdrant, zero API costs |
| 2026-03-31 | 🔄 Cascade: Partial | Basic `--no-cascade` flag implemented; partial DAG recovery still in backlog |
| 2026-03-31 | SWARM-bench: Not started | `benchmark.ts` is memory strategy benchmarking; true evaluation harness still needed |
| 2026-03-27 | Prioritize SWARM-bench over heartbeats | No runaway token incidents; cascade failures are bigger problem |
| 2026-03-27 | Defer AgentKV/CortexDB to Phase 3 | Need benchmarks to measure improvement |

---

## Related Resources

- [SKILL.md](SKILL.md) — Full orchestrator documentation
- [AGENTS.md](AGENTS.md) — Agent context and lessons learned
- [COMPOSITE_ROUTER_DESIGN.md](COMPOSITE_ROUTER_DESIGN.md) — 6-signal routing design
- [../zo-memory-system/SKILL.md](../zo-memory-system/SKILL.md) — Memory system documentation

---

*Last updated: 2026-03-31*
