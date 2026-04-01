# Zouroboros Backlog

> Active backlog for evaluation and future work. All P0/P1 items have been completed and moved to [CHANGELOG.md](CHANGELOG.md).

## Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| 🟢 P2 | Nice to have - incremental | Next 6 months |
| ⚪ P3 | Exploration - experimental | Future |

---

## 🟢 P2 — Nice to Have

### Everything-Claude-Code Research (Continued)

#### [ECC-006] Manifest-Driven Selective Install
**Priority**: P2
**Effort**: Medium (1-2 weeks)
**Status**: Proposed → Needs Evaluation
**Impact**: Medium — enables selective deployment (e.g., memory-only, swarm-only)

Component manifest for installing only needed Zouroboros features:
```yaml
# zo-ecosystem/manifest.yaml
components:
  memory: { skills: [zo-memory-system], agents: 1, tools: [memory.ts] }
  swarm: { skills: [zo-swarm-orchestrator], agents: 3, tools: [orchestrate-v4.ts] }
  vault: { skills: [zo-vault], agents: 1 }
  finance: { skills: [alpaca-trading-skill, backtesting-skill], agents: 1 }
```

Install: `zo-ecosystem install --profile minimal` or `zo-ecosystem install memory swarm`

**Acceptance Criteria**:
- [ ] Manifest schema definition
- [ ] Dependency resolution
- [ ] Install/uninstall commands
- [ ] State tracking of installed components
- [ ] Incremental update support

---

#### [ECC-007] Multi-Harness Abstraction
**Priority**: P2
**Effort**: Medium-Large (2-3 weeks)
**Status**: Proposed → Needs Evaluation
**Impact**: Medium — extend Zouroboros to work with Claude Code, Gemini CLI, Codex, etc.

Make Zouroboros skills work equally well across harnesses:
- Claude Code (.claude/)
- Codex (.codex/)
- Cursor (.cursor/)
- Gemini CLI (via bridge scripts)
- Hermes (native)

**Acceptance Criteria**:
- [ ] Harness detection
- [ ] Per-harness config overlays
- [ ] Bridge script compatibility matrix
- [ ] Harness-specific tool mapping
- [ ] Unified skill format across harnesses

---

#### [ECC-008] Skill Evolution as Closed Loop
**Priority**: P2
**Effort**: Large (3-4 weeks)
**Status**: Proposed → Needs Evaluation
**Impact**: Medium — self-improving skill system

Closed-loop skill evolution:
```
Success → extract winning pattern → evolve skill version → test against eval fixture → promote
Failure → classify error type → flag skill for review → update instructions → retest
```

**Acceptance Criteria**:
- [ ] Success pattern extraction
- [ ] Skill version management
- [ ] Automated test-on-evolve
- [ ] Promotion/demotion workflows
- [ ] Evolution history tracking

---

#### [ECC-009] Observer Loop Guard (5-Layer)
**Priority**: P2
**Effort**: Small (2-3 days)
**Status**: Proposed → Needs Evaluation
**Impact**: Medium — prevents recursive routing loops

Guard against self-referential routing loops:
1. Request origin tracking
2. Loop depth limit
3. Cyclic call detection
4. Timeout on recursive chains
5. Circuit breaker for detected loops

**Acceptance Criteria**:
- [ ] Origin header propagation
- [ ] Loop detection algorithm
- [ ] Automatic loop breaking
- [ ] Alerting on loop incidents

---

#### [ECC-010] Memory Explosion Throttling
**Priority**: P2
**Effort**: Small (1-2 days)
**Status**: Proposed → Needs Evaluation
**Impact**: Medium — prevents vector DB bloat

Prevent excessive embedding generation:
- **Throttle**: max N embeddings per conversation minute
- **Tail sampling**: keep only last K captures when limit hit
- **Cooldown**: don't re-embed same content within 5 minutes

**Acceptance Criteria**:
- [ ] Rate limiting on embedding generation
- [ ] Duplicate detection with cooldown
- [ ] Sampling strategy for overflow
- [ ] Metrics on throttled embeddings

---

### Swarm Orchestrator

#### AgentKV/CortexDB Evaluation for Memory Backend
**Status**: Proposed → Spike Required
**Effort**: Medium-Large (2-3 weeks for evaluation + decision)
**Impact**: High — Potential replacement for SQLite+Ollama stack

Evaluate AgentKV (Python/C++) and CortexDB (Go) as potential backends for zo-memory-system. Both offer local-first, single-file graph+vector storage.

| Criteria | Current (SQLite+Ollama) | AgentKV | CortexDB |
|----------|------------------------|---------|----------|
| Language | TypeScript/Bun | Python/C++ | Go |
| Storage | SQLite file | Single mmap'd file | SQLite-backed |
| Vector Search | Ollama (external) | HNSW (embedded) | HNSW (embedded) |
| Graph | Custom adjacency table | Property graph edges | Knowledge graph |

**Acceptance Criteria**:
- [ ] Functional TypeScript bindings for CortexDB
- [ ] Benchmark suite comparing current vs. CortexDB vs. AgentKV
- [ ] Decision document with migration plan or rejection rationale
- [ ] If accepted: migration path for existing users

**Rationale**: Current SQLite+Ollama stack works but has latency overhead. Embedded vector+graph could reduce search latency from ~4s to <100ms.

---

### Memory System

#### Memory v4 Enhancements (Migrated from zouroboros-memory-system)
**Status**: Migrated 2026-04-01
**Impact**: High — 9 new capabilities in packages/memory/src/

Migrated scripts from `zouroboros-memory-system` into the monorepo:

| ID | Feature | File |
|----|---------|------|
| MEM-001 | Context Budget Awareness | `context-budget.ts` |
| MEM-002 | Recursive Episode Summarization | `episode-summarizer.ts` |
| MEM-003 | Iterative Multi-Hop Retrieval | `multi-hop.ts` |
| MEM-101 | Memory System Metrics Dashboard | `metrics.ts` |
| MEM-102 | Import Pipeline (ChatGPT, Obsidian, Markdown) | `import-pipeline.ts` |
| MEM-103 | Memory Conflict Resolution | `conflict-resolver.ts` |
| MEM-104 | Cross-Persona Memory Sharing | `cross-persona.ts` |
| MEM-105 | Enhanced Knowledge Graph Traversal | `graph-traversal.ts` |
| MEM-202 | Embedding Model Benchmark | `embedding-benchmark.ts` |

#### [MEM-201] Vector Database Migration
**Status**: Not Started
**Effort**: High (5-7 days)
**Impact**: Medium — scale beyond 10k facts

Current: SQLite + in-memory vector similarity (brute force).
Proposed: Add LanceDB or pgvector for >10k facts.

**Acceptance Criteria**:
- [ ] LanceDB integration with SQLite fallback
- [ ] Migration path for existing embeddings
- [ ] Benchmark: query latency vs fact count
- [ ] Hybrid search uses HNSW when available

**Blocker**: Current scale (~1k facts) doesn't justify complexity. Revisit at 10k+ facts.

---

### Repository Consolidation ✅ Complete

All individual repos have been migrated to the monorepo and archived (2026-04-01):

| Repo | Monorepo Location | Status |
|------|-------------------|--------|
| ~~`zouroboros-memory-system`~~ | `packages/memory/` | ✅ Migrated + archived |
| ~~`zouroboros-swarm-orchestrator`~~ | `packages/swarm/` | ✅ Archived |
| ~~`zouroboros-swarm-executors`~~ | `packages/swarm/src/executor/` | ✅ Migrated + archived |
| ~~`zouroboros-persona-creator`~~ | `packages/persona-creator/` | ✅ Archived |
| ~~`Projects/zouroboros-rag-expansion`~~ | `packages/rag/` | ✅ Migrated (2026-04-01) |

**Remaining standalone repos (not part of monorepo):**
- `zouroboros-seedkit` — Standalone installer/bootstrap kit, stays independent
- `zo-ai-character-builder` — Standalone skill, stays independent

**Post-Archive Remaining Steps:**

| Phase | Action | Status |
|-------|--------|--------|
| 1 | Archive individual repos with deprecation README | ✅ Done |
| 2 | Subtree merge preserving full git history | Deferred — current copy-based migration is sufficient |
| 3 | Export critical open issues to monorepo | ✅ No open issues on archived repos |
| 4 | Update all package.json paths | ✅ Dependencies point to monorepo |
| 5 | Pin monorepo to profile; update bio | Pending |

---

### User Experience

- [ ] **Web dashboard** — Browser-based UI (alternative to TUI)
- [ ] **VS Code extension** — Integrated Zouroboros experience
- [ ] **Zo chat shortcuts** — Natural language command shortcuts
- [ ] **Interactive tutorials** — Built-in guided learning paths
- [ ] **Video documentation** — Tutorial series for complex features

### Platform Support

- [ ] **Windows support** — Native Windows compatibility for all bridges
- [ ] **macOS optimizations** — Apple Silicon optimizations
- [ ] **Cloud deployment** — Kubernetes Helm charts
- [ ] **Serverless adapters** — AWS Lambda, Cloud Functions support

### Advanced Features

- [ ] **Multi-tenant support** — Isolate data for multiple users
- [ ] **Federated memory** — Share memory across Zo instances
- [ ] **A/B testing framework** — Compare persona/skill variants
- [ ] **Cost tracking** — Detailed per-feature cost attribution
- [ ] **Carbon footprint** — Energy usage tracking for AI calls

### Integrations

- [ ] **GitHub integration** — PR automation, code review agents
- [ ] **Slack/Discord bots** — Chat-based Zouroboros access
- [ ] **Notion/Linear sync** — Bidirectional task/project sync
- [ ] **Obsidian plugin** — Knowledge graph integration
- [ ] **Raycast/Alfred** — Quick launcher integrations

---

## ⚪ P3 — Experimental

### Research Directions

- [ ] **Learned routing** — RL-based executor selection
- [ ] **Neural memory** — Transformer-based memory retrieval
- [ ] **Speculative execution** — Predict and pre-run likely tasks
- [ ] **Self-modifying code** — Safe code generation and hot-reload
- [ ] **Multi-modal agents** — Vision, audio, video processing

### Architecture Evolution

- [ ] **Distributed swarm** — Multi-node orchestration
- [ ] **Edge deployment** — Run agents on edge devices
- [ ] **Blockchain anchoring** — Immutable audit logs
- [ ] **Homomorphic encryption** — Private computation on encrypted data
- [ ] **Quantum-ready crypto** — Post-quantum security preparation

### Swarm Orchestrator (Icebox)

#### Heartbeat Token Limit for Bridge Executors
**Status**: Icebox — Monitor triggers
**Effort**: Medium
**Impact**: Low (no active incidents)

Add bridge-level watchdog for hung bridges and per-task token budgets.

**Trigger to Revive**:
- Swarm tasks exceed 50K tokens per task
- Executor hangs >3 per week

**Evidence**: Analyzed 62 swarm runs — zero runaway output incidents, only 1 hung task.

---

#### Request Caching + Deduplication
**Status**: Icebox
**Effort**: Small
**Impact**: Medium (cost reduction)

Cache identical task requests to avoid redundant execution.

**Trigger to Revive**:
- Observed duplicate task execution patterns
- Cost concerns from redundant API calls

---

#### Visual Dashboard for Real-Time Monitoring
**Status**: Icebox
**Effort**: Large
**Impact**: Medium (UX improvement)

Web dashboard showing active swarm runs, task progress, circuit breaker states.

**Trigger to Revive**:
- Multiple concurrent swarm campaigns become common

---

## Metrics

| Category | P2 | P3 | Total |
|----------|----|----|-------|
| ECC Research | 5 | 0 | 5 |
| Swarm | 1 | 3 | 4 |
| Memory | 1 | 0 | 1 |
| Repo Consolidation | 1 | 0 | 1 |
| UX | 5 | 0 | 5 |
| Platform | 4 | 0 | 4 |
| Advanced | 5 | 0 | 5 |
| Integrations | 5 | 0 | 5 |
| Research | 0 | 5 | 5 |
| Architecture | 0 | 5 | 5 |
| **Total** | **27** | **13** | **40** |

**All P0 and P1 work**: Completed → see [CHANGELOG.md](CHANGELOG.md)

---

## Contributing

To add items to this backlog:

1. **Create an issue** describing the feature/bug
2. **Add to this file** under appropriate priority
3. **Tag with labels**: `enhancement`, `bug`, `docs`, `research`
4. **Reference related issues** in the item description

### Template

```markdown
- [ ] **Title** - Brief description
  - Owner: @username (optional)
  - Related: #123, #456
  - Notes: Additional context
```

---

*Last updated: 2026-04-01*
*Next review: 2026-05-01*
