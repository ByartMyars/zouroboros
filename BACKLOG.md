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
- [ ] **Unit test suite** - Achieve 80%+ coverage across all packages
- [ ] **Integration tests** - End-to-end tests for critical paths
- [ ] **CI/CD pipeline** - GitHub Actions for automated testing on PRs
- [ ] **Performance benchmarks** - Memory, latency, throughput baselines

### Core Stability
- [ ] **Error recovery mechanisms** - Graceful degradation when subsystems fail
- [ ] **Database migration system** - Versioned schema migrations for memory DB
- [ ] **Configuration validation** - Runtime schema validation with helpful errors
- [ ] **Backup/restore utilities** - Automated backup scripts for memory data

---

## 🟡 P1 - Important

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

### Swarm Orchestrator Enhancements
- [ ] **Streaming capture v2** - Real-time output streaming with backpressure
- [ ] **Token optimizer integration** - Hierarchical memory strategies per-task
- [ ] **Stagnation detection** - Automatic unstuck trigger when tasks stall
- [ ] **Cascade mode improvements** - Better failure propagation and recovery
- [ ] **Cross-task context sharing** - Memory passing between dependent tasks

### Memory System
- [ ] **HyDE expansion** - Hypothetical document embedding for better search
- [ ] **Graph-boosted search v2** - RRF fusion with learned weights
- [ ] **Cognitive profiles** - Per-executor performance tracking
- [ ] **Auto-capture integration** - Automatic conversation capture
- [ ] **MCP server for memory** - External access via Model Context Protocol

### Persona System
- [ ] **SkillsMP API client** - Search and import community skills
- [ ] **Persona marketplace** - Share/export persona configurations
- [ ] **Live persona switching** - Runtime persona changes without restart
- [ ] **Persona analytics** - Usage metrics and effectiveness tracking

### Self-Heal Improvements
- [ ] **Feedback loop tuning** - Auto-adjust weights from prescription outcomes
- [ ] **Multi-metric optimization** - Optimize for composite scores, not single metrics
- [ ] **Prescription templates** - Community-contributed improvement playbooks
- [ ] **Evolution history** - Track and visualize system improvements over time

---

## 🟢 P2 - Nice to Have

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
- ✅ OmniRoute complexity analysis and routing
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
