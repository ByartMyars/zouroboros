# Changelog

## [v1.0.0] — 2026-04-07

> First unified monorepo release. All packages consolidated from individual repos.
> Includes hardening sprint: ECC-009 loop guard, ECC-010 memory throttling,
> honest ROADMAP audit, and full CI expansion.

### Features
- **memory**: ECC-010 — memory explosion throttling in generateEmbedding (`35276b6`)
- **swarm**: ECC-009 — 5-layer Observer Loop Guard (`2871fd0`)
- **swarm**: add dep-graph utility + preflight write-scope conflict detection (`cc29b41`)
- **memory**: PKA session briefing + gap audit protocol (`f1473b6`)
- **swarm**: add ACP adapter install script and README documentation (`ceae46a`)
- **swarm**: ACP transport integration, model routing, and tier mapping updates (`4110bb7`)
- **benchmarks**: add optimized memory benchmark adapters (#24) (`4339ed0`)
- **skills**: add agent-model-healer v2 — self-healing model watchdog (`8163d3d`)
- add unified Skills/zouroboros bootstrap skill for zero-build distribution (`6a23ba8`)
- migrate zo-swarm-orchestrator and zo-memory-system skills into monorepo (`e85203c`)
- migrate 7 self-enhancement skills into monorepo (`d617cda`)
- migrate zo-swarm-orchestrator and zo-memory-system skills into monorepo (`b1348b1`)
- migrate 7 self-enhancement skills into monorepo (`0cc22f6`)
- add postbuild hook to auto-run init and doctor after build (`48d1b29`)
- expanded backlog — MEM-001/MEM-002/MEM-101/MEM-003/MEM-102-105/MEM-202 + decision log (`158dfdf`)
- add polished hero banner and architecture graphics (#8) (`69a8644`)
- P0 + P1 + ECC enhancements — 29 modules, 586 tests (`d6ff6a0`)
- P0 + P1 + ECC enhancements — 29 modules, 586 tests, 6 packages (`c659aff`)
- swarm orchestrator enhancement phases 1-4 complete (`73a2f3d`)

### Bug Fixes
- **swarm-bench**: add pattern_flags support and fix flaky dataset criteria (`b2f6156`)
- **swarm-bench**: substitute /tmp/test-project path in test_pass commands (`c94e982`)
- **ci**: regenerate pnpm-lock.yaml to include tui workspace (`6feed1d`)
- **cli**: correct TUI module resolution path (`b6ab633`)
- preflight health checks and executor/persona decoupling in swarm orchestrator (`1b89cd9`)
- replace broken API agent check with local marker file (`fa3b8df`)
- remove hardcoded email from agent manifest for portability (`5459a9a`)
- replace broken agent auto-fix with actionable Zo chat instruction (`29642af`)
- write agent payload to temp file to avoid shell escaping issues (`537e24f`)
- skip scheduled agents check on non-Zo installs, auto-create via --fix (`35d18d1`)
- use bun cli/dist path in postbuild instead of zouroboros binary (`8c187df`)
- resolve TypeScript build errors in memory and swarm packages (`a6da38c`)
- **ci**: remove duplicate pnpm version specification (#7) (`1725799`)

### Refactoring
- remove all OmniRoute references from codebase (`971896b`)

### Documentation
- **roadmap**: audit Phase 1 — mark all implemented items complete (`59e7390`)
- **cortexdb**: mark Phase D production rollout complete (`b702391`)
- remove obsolete "From Zo Chat" init instruction from README (`f1975fb`)
- reorder README quick start — skill install after monorepo install (`a43f8f7`)
- mark repository consolidation complete — all repos migrated and archived (`104e538`)
- clarify Zo-native origins and add referral link (`e1d7e09`)
- remove OmniRoute references from README (`0bd2ab7`)
- note tier-resolver v2.1.0 upgrade in BACKLOG (`5721b92`)

### Chores
- remove unused imports from doctor utility (`1abfe21`)
- remove tui from install quick start (`21b9562`)

### Other
- Wire ACP adapter install into one-liner setup script (#27) (`2e7ec57`)
- swarm: remove deprecated v4 references (`5d11410`)
- swarm: polish hierarchical telemetry docs (`045b912`)
- swarm: add delegation history report (`ab91537`)
- swarm: surface hierarchical telemetry in status (`7cf91a7`)
- swarm: lock in hierarchical orchestration telemetry (`74e023c`)
- Add agent creation step to README quick start (`d41e99c`)
- Remove deprecated orchestrate-v4.ts, update all references to v5 (`971ad0c`)
- Add executor auto-install: doctor --fix installs missing executors, install.sh shows prerequisites (`1ad0a6f`)
- Migrate swarm-executors repo into monorepo packages/swarm/ (`837c531`)
- Migrate 9 memory v4 enhancement scripts from zouroboros-memory-system (`a841138`)
- Consolidate backlog: migrate completed P0/P1/ECC to CHANGELOG, P2/P3 to BACKLOG (`793dda4`)
- Add declarative specs for 5 scheduled agents with doctor verification (`7d16bd9`)
- Migrate production v5 swarm orchestrator into monorepo (`f193918`)
- Add persona-creator package from standalone repo (`435239f`)
- Fix CLI not found after install — use wrapper script instead of pnpm link (`0f2bd30`)
- Auto-initialize memory DB, Ollama, and config during install (#12) (`75e80d6`)
- Fix install script: suppress bin warnings, resolve PNPM_HOME error (`a266ec4`)
- Fix all 10+ TypeScript build errors for seamless v2.0.0 installation (`ae78b43`)
- Pre-public cleanup: remove stubs, fix docs, add repo metadata (`7ac0912`)

---

## Package Versions at Release

| Package | Version |
|---------|---------|
| zouroboros-core | 2.0.0 |
| zouroboros-memory | 3.0.0 |
| zouroboros-swarm | 5.0.0 |
| zouroboros-workflow | (see package.json) |
| zouroboros-selfheal | (see package.json) |
| zouroboros-personas | (see package.json) |
| zouroboros-cli | (see package.json) |
| zouroboros-tui | (see package.json) |

> Package versions reflect individual pre-monorepo histories.
> The monorepo tag `v1.0.0` marks the first unified release.
