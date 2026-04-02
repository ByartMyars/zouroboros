# Zouroboros — Self-Enhancing AI Agent Ecosystem

> One-command installer that bootstraps the full Zouroboros stack on any Zo Computer.

## What Is Zouroboros?

Zouroboros is a self-improving agent ecosystem: a closed loop of memory, evaluation, prescription, and evolution that makes your Zo smarter over time. It bundles 9 sub-skills spanning hybrid memory, multi-agent swarm orchestration, self-healing, and structured workflows — all runnable as standalone Bun scripts with zero build step.

## Quick Start

```bash
# 1. Install prerequisites and initialize databases
bun Skills/zouroboros/scripts/install.ts

# 2. Verify everything is healthy
bun Skills/zouroboros/scripts/doctor.ts

# 3. Run a health scorecard
bun Skills/zouroboros/skills/selfheal/scripts/introspect.ts
```

## Sub-Skills

### Core System

| Skill | Dir | Description |
|-------|-----|-------------|
| **zo-memory-system** | `skills/memory/` | Hybrid SQLite + vector memory engine with episodic/procedural/semantic recall, ACT-R activation, wikilink capture, and MCP server |
| **zo-swarm-orchestrator** | `skills/swarm/` | Multi-agent DAG execution across Claude Code, Gemini CLI, Codex, and Hermes with tier routing and inter-agent comms |

### Self-Enhancement (Closed Loop)

| Skill | Dir | Description |
|-------|-----|-------------|
| **zouroboros-introspect** | `skills/selfheal/` | 7-metric health scorecard (memory, recall, eval, graph, stagnation, self-heal, composite) |
| **zouroboros-prescribe** | `skills/selfheal/` | Auto-generate improvement seeds from scorecard gaps |
| **zouroboros-evolve** | `skills/selfheal/` | Execute prescriptions with regression detection and rollback |

### Workflow

| Skill | Dir | Description |
|-------|-----|-------------|
| **spec-first-interview** | `skills/workflow/` | Socratic interview that produces seed specifications |
| **three-stage-eval** | `skills/workflow/` | Mechanical → semantic → consensus evaluation pipeline |
| **autoloop** | `skills/workflow/` | Single-metric optimization loop with MCP server |
| **unstuck-lateral** | `skills/workflow/` | 5 lateral-thinking personas for creative problem solving |

## Key Scripts

### Memory (`skills/memory/scripts/`)

```bash
# Store a fact
bun skills/memory/scripts/memory-next.ts store --text "API key rotated" --scope workspace

# Search memory
bun skills/memory/scripts/memory-next.ts search --query "API key" --top 5

# Start MCP server (for Claude Desktop / other MCP clients)
bun skills/memory/scripts/mcp-server.ts
```

### Swarm (`skills/swarm/scripts/`)

```bash
# Run a swarm task
bun skills/swarm/scripts/orchestrate-v4.ts --plan plan.json

# Start swarm MCP server
bun skills/swarm/scripts/mcp-server.ts
```

### Self-Enhancement (`skills/selfheal/scripts/`)

```bash
# Health scorecard
bun skills/selfheal/scripts/introspect.ts --json

# Generate improvement prescriptions
bun skills/selfheal/scripts/prescribe.ts

# Execute a prescription
bun skills/selfheal/scripts/evolve.ts --seed seed-file.md
```

### Autoloop (`skills/workflow/scripts/autoloop/`)

```bash
# Run optimization loop
bun skills/workflow/scripts/autoloop/autoloop.ts --metric coverage --target 80

# Start autoloop MCP server
bun skills/workflow/scripts/autoloop/mcp-server.ts
```

## Prerequisites

| Dependency | Required | Purpose |
|-----------|----------|---------|
| **Bun** | Yes | Runtime for all scripts |
| **SQLite3** | Recommended | Memory database CLI |
| **Ollama** | Recommended | Local embeddings + classifier |
| **nomic-embed-text** | Recommended | Vector similarity search |
| **qwen2.5:1.5b** | Optional | Memory gate classifier |

The installer (`scripts/install.ts`) handles all of these automatically.

## Architecture

```
Skills/zouroboros/
├── SKILL.md              ← you are here
├── scripts/
│   ├── install.ts        ← one-command bootstrap
│   ├── doctor.ts         ← health check (--fix, --json)
│   └── package.json      ← MCP SDK dependency
├── skills/
│   ├── memory/           ← 41 standalone scripts
│   │   ├── scripts/
│   │   ├── references/
│   │   └── SKILL.md
│   ├── swarm/            ← 20 standalone scripts
│   │   ├── scripts/
│   │   ├── references/
│   │   └── SKILL.md
│   ├── selfheal/         ← 4 standalone scripts + 3 SKILL.md
│   │   ├── scripts/
│   │   └── references/
│   └── workflow/          ← 4 sub-skills (interview, eval, autoloop, unstuck)
│       ├── scripts/
│       └── references/
└── assets/
    └── template.program.md
```

## How It Works

1. **Install**: `install.ts` checks for Bun, installs MCP SDK, creates the shared-facts SQLite database with full schema, optionally pulls Ollama models, and symlinks `node_modules` into sub-skill script directories that need it.

2. **Doctor**: `doctor.ts` runs 10+ health checks across runtime, database, models, sub-skills, dependencies, and swarm executors. Use `--fix` to auto-repair.

3. **Use**: Each sub-skill's scripts are self-contained Bun scripts. Run them directly — no monorepo clone, no `pnpm install`, no TypeScript build step needed.

## Updating

To update from the Zouroboros monorepo:

```bash
cd /path/to/zouroboros
git pull
zouroboros skills install --dest ~/Skills
```

Or manually copy updated standalone scripts from `packages/*/src/standalone/` into the corresponding `skills/*/scripts/` directories.
