# Zouroboros Backlog

> Future enhancements, deferred features, and roadmap items

## Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| 🔴 P0 | Critical - blocks production use | Next 30 days |
| 🟡 P1 | Important - significant value | Next 90 days |
| 🟢 P2 | Nice to have - incremental | Next 6 months |
| ⚪ P3 | Exploration - experimental | Future |

---

## 🔴 P0 - Critical

### Testing & Quality
- [x] **Unit test suite** - Achieve 80%+ coverage across all packages (2026-04-01)
- [x] **Integration tests** - End-to-end tests for critical paths (2026-04-01)
- [x] **CI/CD pipeline** - GitHub Actions for automated testing on PRs (2026-04-01)
- [x] **Performance benchmarks** - Memory, latency, throughput baselines (2026-04-01)

### Core Stability
- [x] **Error recovery mechanisms** - Graceful degradation when subsystems fail (2026-04-01)
- [x] **Database migration system** - Versioned schema migrations for memory DB (2026-04-01)
- [x] **Configuration validation** - Runtime schema validation with helpful errors (2026-04-01)
- [x] **Backup/restore utilities** - Automated backup scripts for memory data (2026-04-01)

### Cross-Package Integration Tests (Sprint 3)
- [x] **SelfHeal ↔ HookSystem** - Lifecycle phase observation via hooks (2026-04-01)
- [x] **DAG Executor ↔ Cascade/Context** - Failure propagation, retry, context forwarding (2026-04-01)
- [x] **Persona ↔ Memory Profile Bridge** - Analytics sync, trait mapping, combined reports (2026-04-01)

**Total: 586 tests, 0 failures, 36 files, 1.77s** (as of 2026-04-01)

---

## 🟡 P1 - Important

### Everything-Claude-Code Research (Evaluation Required)
> Concepts derived from analyzing the Anthropic Hackathon-winning everything-claude-code repository (affaan-m/everything-claude-code). These require spec-first evaluation before implementation.

#### [ECC-001] Lifecycle Hook System
**Priority**: P1  
**Effort**: Medium (1-2 weeks)  
**Status**: ✅ Implemented (2026-04-01)
**Impact**: High — enables live-session continuation, not just test harness

Event-driven hooks that fire at structured points in the conversation lifecycle:
- `.on("conversation.start")` — session begin
- `.on("conversation.end")` — session close → trigger memory capture
- `.on("task.complete")` — swarm task done → post-result capture
- `.on("task.fail")` — failure → extract failure pattern
- `.on("tool.call", { tool: "Bash" })` — specific tool usage
- `.on("mutation.complete")` — file changed → extract decision
- `.on("memory.threshold")` — token budget % exceeded → checkpoint

**Acceptance Criteria**:
- [x] Hook registry system with typed events (2026-04-01)
- [x] Event payloads with relevant context (2026-04-01)
- [x] Async handlers with error isolation (2026-04-01)
- [x] Integration with existing continuation eval system (2026-04-01)
- [x] Configurable hooks via skills/agents (2026-04-01)

**Evaluation Questions**:
- How does this differ from existing rule conditions?
- What events should be in v1 vs future expansion?
- Should hooks be file-based (like ECC) or programmatic?

---

#### [ECC-002] Slash Commands Hub
**Priority**: P1
**Effort**: Medium (1 week)
**Status**: ✅ Implemented (2026-04-01)
**Impact**: High — makes skills ergonomic to invoke from any persona

First-class CLI-style commands for Zouroboros operations:
```
/memory store|search|stats|evolve
/swarm run|status|cancel|history
/eval run|check|report
/profile show|update|export
/skill list|install|update|evolve
/sessions branch|compact|search|metrics
```

Each command is a zero-dependency script callable from any persona conversation.

**Acceptance Criteria**:
- [x] Command parser with subcommands and flags (2026-04-01)
- [x] Unified help system (2026-04-01)
- [x] Integration with memory gate for auto-capture on `/` commands (2026-04-01)
- [x] Tab completion support (2026-04-01)
- [x] Cross-skill command registration (2026-04-01)

**Evaluation Questions**:
- Should this be a standalone skill or core CLI enhancement?
- How does this relate to existing skill invocation patterns?
- What's the namespace collision strategy?

---

#### [ECC-003] Session Management (Branch / Search / Compact / Metrics)
**Priority**: P1
**Effort**: Medium-Large (2 weeks)
**Status**: ✅ Implemented (2026-04-01)
**Impact**: High — directly improves production reliability via proactive compaction

Active session management capabilities:
- **Branch** — fork a session, explore in isolation
- **Search** — full-text search across session history
- **Compact** — Ollama summarization + context trim
- **Metrics** — tokens/session, success rate, tool usage stats

**Acceptance Criteria**:
- [x] Session branching with isolated contexts (2026-04-01)
- [x] FTS index of session messages (2026-04-01)
- [x] Ollama-powered compaction with summary generation (2026-04-01)
- [x] Per-session metrics dashboard (2026-04-01)
- [x] Checkpoint/restore integration (2026-04-01)

**Evaluation Questions**:
- How does this integrate with existing checkpoint system?
- What's the storage overhead for session history?
- Should this be memory-system feature or new skill?

---

#### [ECC-004] Instincts — Pattern Auto-Extraction
**Priority**: P1
**Effort**: Large (2-3 weeks)
**Status**: ✅ Implemented (2026-04-01)
**Impact**: High — converts recurring failures into hot-loadable safeguards

Automatic extraction of behavioral patterns from sessions:
1. Detect pattern (repeated workflow, failure recurrence)
2. Score confidence (frequency × recency × distinctiveness)
3. Extract as instinct file
4. Skill hot-load into future sessions

**Proposed Instinct Schema**:
```yaml
name: ffb-autoposter-approval-loop
confidence: 0.82
pattern: "autoposter skips posts labeled 'approved' instead of 'approved/ready'"
trigger: "autoposter + approval keyword in same session"
resolution: "Check 'approved' label exact spelling in FFB content calendar"
evidence_count: 3
last_seen: 2026-03-28
```

**Acceptance Criteria**:
- [x] Pattern detection from session logs (2026-04-01)
- [x] Confidence scoring algorithm (2026-04-01)
- [x] Instinct file format and storage (2026-04-01)
- [x] Hot-load mechanism for instinct injection (2026-04-01)
- [x] UI for reviewing/approving extracted instincts (2026-04-01)

**Evaluation Questions**:
- How does this differ from procedural memory evolution?
- What's the false positive rate for pattern detection?
- Should instincts be manual-reviewed before activation?

---

#### [ECC-005] Token Budget Hook Wiring
**Priority**: P1
**Effort**: Medium (1 week)
**Status**: ✅ Implemented (2026-04-01)
**Impact**: High — closes gap between eval fixture and live sessions

Systematic token optimization with proactive checkpointing:

| Trigger | Action |
|---------|--------|
| Context at 60% | Switch to leaner injection (facts only, no episodes) |
| Context at 80% | Auto-compact oldest episode, prune low-confidence facts |
| Context at 90% | Full checkpoint to `AGENTS.md` update, new session prompt |
| Swarm run >50% context | Pause mid-wave, capture state, resume in new session |

**Acceptance Criteria**:
- [x] Real-time context monitoring (2026-04-01)
- [x] Progressive compression strategies (2026-04-01)
- [x] Automatic checkpoint at critical thresholds (2026-04-01)
- [x] Swarm wave pause/resume for context budget (2026-04-01)
- [x] Integration with continuation eval (2026-04-01)

**Evaluation Questions**:
- How does this interact with ECC-001 hooks vs rules?
- What are the optimal threshold percentages?
- How to handle mid-task interruption gracefully?

### Repository Consolidation & Deprecation
- [ ] **Migrate individual repos to monorepo** - Deprecate zo-swarm-orchestrator, zo-memory-system, etc. in favor of Zouroboros monorepo
  - **Trigger**: When Zouroboros repo goes public
  - **Strategy**: Archive with redirect notices (preserve history via git subtree)
  - **Impact**: Stars reset to zero; forks orphaned but functional; deep links break

  **Pre-Public (Current - Private Monorepo):**
  - [x] **Create paired-branch automation script** - `scripts/paired-branch.sh` for managing cross-repo changes
  - [x] **Create automated check agent** - Scheduled Tue/Fri 10 AM to detect unpaired changes
    - Agent runs `scripts/check-paired-branches.sh --notify`
    - Emails if issues found (uncommitted changes, unpaired branches, open PRs)
  - [ ] Use hybrid paired-branch strategy for cross-repo changes:
    ```bash
    # Create branches across all repos
    ./scripts/paired-branch.sh swarm-cascade-fix
    
    # Or for specific repos only
    ./scripts/paired-branch.sh memory-hyde zo-memory-system,zo-swarm-orchestrator
    
    # Check status of existing workflow
    ./scripts/paired-branch.sh --status feat/swarm-cascade-fix
    
    # Manual check (also runs via scheduled agent Tue/Fri 10 AM)
    ./scripts/check-paired-branches.sh
    ```
  - [ ] Create feature branches in both repos with matching names: `feat/swarm-cascade-fix`
  - [ ] Open PRs in parallel; merge zo-swarm-orchestrator first, then Zouroboros
  - [ ] Document dependency order in PR descriptions

  **Post-Public Deprecation Plan:**
  
  | Phase | Action | Output |
  |-------|--------|--------|
  | 1 | Archive individual repos with deprecation README | `github.com/user/repo` → archived, read-only |
  | 2 | Subtree merge preserving full git history | `packages/swarm-orchestrator/` with blame intact |
  | 3 | Export critical open issues to monorepo migration tracking issue | Single #1 issue with checklist |
  | 4 | Update all package.json/go.mod paths | Dependencies point to monorepo subpaths |
  | 5 | Pin monorepo to profile; update bio | Star accumulation begins fresh |

  **Asset Preservation:**
  | Asset | Fate | Mitigation |
  |-------|------|------------|
  | Stars | Lost (reset to 0) | Pin monorepo; stars recover over time |
  | Forks | Orphaned (still functional) | Archive rather than delete |
  | Deep links | Broken | README redirect notices in archived repos |
  | Issues/PRs | Archived (visible, locked) | Export critical ones pre-archive |
  | Git history | Preserved | Use `git subtree` for full history |

  **Repos to Deprecate:**
  - `zo-swarm-orchestrator` → `packages/swarm-orchestrator/`
  - `zo-memory-system` → `packages/memory-system/`
  - (Add others as they migrate)

  **Command Reference for Subtree Migration:**
  ```bash
  git remote add swarm ../zo-swarm-orchestrator
  git fetch swarm
  git subtree add --prefix=packages/swarm-orchestrator swarm main
  git remote remove swarm
  ```

### Swarm Orchestrator

## Swarm Orchestrator Enhancements
- [x] **Streaming capture v2** - Real-time output streaming with backpressure (2026-04-01)
- [x] **Token optimizer integration** - Hierarchical memory strategies per-task (2026-04-01)
- [x] **Stagnation detection** - Automatic unstuck trigger when tasks stall (2026-04-01)
- [x] **Cascade mode improvements** - Better failure propagation and recovery (2026-04-01)
- [x] **Cross-task context sharing** - Memory passing between dependent tasks (2026-04-01)

### Memory System
- [x] **HyDE expansion** - Hypothetical document embedding for better search (2026-04-01)
- [x] **Graph-boosted search v2** - RRF fusion with learned weights (2026-04-01)
- [x] **Cognitive profiles** - Per-executor performance tracking (2026-04-01)
- [x] **Auto-capture integration** - Automatic conversation capture (2026-04-01)
- [x] **MCP server for memory** - External access via Model Context Protocol (2026-04-01)

### Persona System
- [x] **SkillsMP API client** - Search and import community skills (2026-04-01)
- [x] **Persona marketplace** - Share/export persona configurations (2026-04-01)
- [x] **Live persona switching** - Runtime persona changes without restart (2026-04-01)
- [x] **Persona analytics** - Usage metrics and effectiveness tracking (2026-04-01)

### Self-Heal Improvements
- [x] **Feedback loop tuning** - Auto-adjust weights from prescription outcomes (2026-04-01)
- [x] **Multi-metric optimization** - Optimize for composite scores, not single metrics (2026-04-01)
- [x] **Prescription templates** - Community-contributed improvement playbooks (2026-04-01)
- [x] **Evolution history** - Track and visualize system improvements over time (2026-04-01)

---

## 🟢 P2 - Nice to Have

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

### User Experience
- [ ] **Web dashboard** - Browser-based UI (alternative to TUI)
- [ ] **VS Code extension** - Integrated Zouroboros experience
- [ ] **Zo chat shortcuts** - Natural language command shortcuts
- [ ] **Interactive tutorials** - Built-in guided learning paths
- [ ] **Video documentation** - Tutorial series for complex features

### Platform Support
- [ ] **Windows support** - Native Windows compatibility for all bridges
- [ ] **macOS optimizations** - Apple Silicon optimizations
- [ ] **Cloud deployment** - Kubernetes Helm charts
- [ ] **Serverless adapters** - AWS Lambda, Cloud Functions support

### Advanced Features
- [ ] **Multi-tenant support** - Isolate data for multiple users
- [ ] **Federated memory** - Share memory across Zo instances
- [ ] **A/B testing framework** - Compare persona/skill variants
- [ ] **Cost tracking** - Detailed per-feature cost attribution
- [ ] **Carbon footprint** - Energy usage tracking for AI calls

### Integrations
- [ ] **GitHub integration** - PR automation, code review agents
- [ ] **Slack/Discord bots** - Chat-based Zouroboros access
- [ ] **Notion/Linear sync** - Bidirectional task/project sync
- [ ] **Obsidian plugin** - Knowledge graph integration
- [ ] **Raycast/Alfred** - Quick launcher integrations

---

## ⚪ P3 - Experimental

### Research Directions
- [ ] **Learned routing** - RL-based executor selection
- [ ] **Neural memory** - Transformer-based memory retrieval
- [ ] **Speculative execution** - Predict and pre-run likely tasks
- [ ] **Self-modifying code** - Safe code generation and hot-reload
- [ ] **Multi-modal agents** - Vision, audio, video processing

### Architecture Evolution
- [ ] **Distributed swarm** - Multi-node orchestration
- [ ] **Edge deployment** - Run agents on edge devices
- [ ] **Blockchain anchoring** - Immutable audit logs
- [ ] **Homomorphic encryption** - Private computation on encrypted data
- [ ] **Quantum-ready crypto** - Post-quantum security preparation

---

## Recently Completed ✅

### Phase 1-8 Deliverables (2026-03-27)
- ✅ Core types and configuration system
- ✅ SQLite + vector memory with embeddings
- ✅ Spec-first interview and evaluation pipeline
- ✅ Unstuck lateral thinking (5 personas)
- ✅ Autoloop optimization engine
- ✅ Persona creation with SOUL/IDENTITY architecture
- ✅ Swarm orchestrator with circuit breakers
- ✅ 6-signal composite routing
- ✅ Self-heal introspection and evolution
- ✅ Unified CLI with 10 commands
- ✅ Terminal UI dashboard
- ✅ Complete documentation and examples

---

## Contributing

To add items to this backlog:

1. **Create an issue** describing the feature/bug
2. **Add to this file** under appropriate priority
3. **Tag with labels**: `enhancement`, `bug`, `docs`, `research`
4. **Reference related issues** in the item description

### Template for New Items

```markdown
- [ ] **Title** - Brief description
  - Owner: @username (optional)
  - Related: #123, #456
  - Notes: Additional context
```

---

## Metrics

| Category | P0 | P1 | P2 | P3 | Total |
|----------|----|----|----|----|-------|
| Core | 4 | 4 | 2 | 1 | 11 |
| Memory | 0 | 5 | 3 | 1 | 9 |
| Swarm | 0 | 4 | 2 | 1 | 7 |
| Personas | 0 | 3 | 3 | 1 | 7 |
| Self-Heal | 0 | 4 | 2 | 1 | 7 |
| UX | 0 | 0 | 5 | 1 | 6 |
| Platform | 0 | 0 | 4 | 1 | 5 |
| Integrations | 0 | 0 | 5 | 0 | 5 |
| Research | 0 | 0 | 0 | 5 | 5 |
| **Total** | **4** | **20** | **26** | **12** | **62** |

---

*Last updated: 2026-03-27*
*Next review: 2026-04-27*
