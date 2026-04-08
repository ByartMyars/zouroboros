<p align="center">
  <img src="./assets/zouroboros-hero-banner.png" alt="Zouroboros — Self-Enhancing AI Platform" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/marlandoj/zouroboros/actions/workflows/ci.yml"><img src="https://github.com/marlandoj/zouroboros/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/marlandoj/zouroboros/releases/tag/v1.1.0"><img src="https://img.shields.io/badge/release-v1.1.0-blue.svg" alt="Release v1.1.0" /></a>
  <a href="https://www.npmjs.com/search?q=zouroboros"><img src="https://img.shields.io/npm/v/zouroboros-core.svg?label=npm&color=cb3837" alt="npm" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://zo.computer"><img src="https://img.shields.io/badge/Zo%20Computer-native-green.svg" alt="Zo Computer" /></a>
</p>

## Overview

Zouroboros consolidates all Zouroboros enhancements into a unified, easy-to-install monorepo. Built from the ground up on [Zo Computer](https://zo.computer) — not ported from external platforms — every module is native to the Zo ecosystem. It provides a complete toolkit for building AI-powered applications with sophisticated memory, multi-agent orchestration, and self-healing capabilities.

### Key Features

🧠 **Hybrid Memory System** — SQLite + vector embeddings with episodic memory  
🐝 **Swarm Orchestration** — Multi-agent campaigns with circuit breakers and DAG execution
🎭 **Persona Framework** — SOUL/IDENTITY architecture with 8-phase creation workflow  
🔄 **Spec-First Development** — Interview, evaluate, unstuck, and autoloop tools  
🏥 **Self-Healing** — Daily introspection, prescription, and autonomous evolution  
💻 **Unified CLI** — Single command interface for all operations  
📊 **Terminal Dashboard** — Real-time monitoring and control

## Quick Start

### Install from npm

Pick the packages you need — no need to clone the whole repo:

```bash
# Core types and utilities
npm install zouroboros-core

# Memory system (SQLite + vector embeddings)
npm install zouroboros-memory

# Multi-agent swarm orchestration
npm install zouroboros-swarm

# Spec-first workflow tools
npm install zouroboros-workflow

# Self-healing pipeline
npm install zouroboros-selfheal

# Persona framework
npm install zouroboros-personas

# RAG expansion
npm install zouroboros-rag

# CLI (global install)
npm install -g zouroboros-cli
```

Or install everything:

```bash
npm install zouroboros-core zouroboros-memory zouroboros-swarm zouroboros-workflow zouroboros-selfheal zouroboros-personas zouroboros-rag
```

### From Source

#### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/marlandoj/zouroboros/main/scripts/install.sh | bash
```

#### Manual Install

```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
pnpm install
pnpm run build
zouroboros init
zouroboros doctor
```

#### Skill Install (recommended for distributing to other Zo Computers)

After installing the monorepo, export all 9 sub-skills as standalone Bun scripts — no build step needed on the target machine:

```bash
# 1. Install prerequisites and initialize databases
bun ~/Skills/zouroboros/scripts/install.ts

# 2. Verify everything is healthy
bun ~/Skills/zouroboros/scripts/doctor.ts
```

The skill bundles 68 standalone scripts across memory, swarm, selfheal, and workflow. See [Skills/zouroboros/SKILL.md](./Skills/zouroboros/SKILL.md) for full usage.

### Create Agents

Zouroboros includes scheduled agents for daily memory maintenance, self-enhancement, and vault indexing. After installation, create them from Zo Chat:

```
Create all Zouroboros agents from agents/manifest.json
```

Then register them locally so `zouroboros doctor` can verify:

```bash
zouroboros agents sync
```

This reads `agents/manifest.json` and registers 5 scheduled agents on your Zo Computer:
- **Memory Embedding Backfill** — indexes new facts nightly
- **Memory Capture** — captures conversation facts
- **Unified Decay** — runs memory decay and cleanup
- **Self-Enhancement Summary** — daily introspect → prescribe → evolve pipeline
- **Vault Indexer** — indexes workspace files into the knowledge graph

## Usage

### Natural Language (Zo Chat)

```
Store in memory that I prefer TypeScript for backend development
```

```
What do you know about my technology preferences?
```

```
Run a spec-first interview for building a REST API
```

```
Check my Zouroboros system health
```

### CLI

```bash
# Memory operations
zouroboros memory store --entity user --key preference --value "dark mode"
zouroboros memory search "technology preferences"

# Workflow tools
zouroboros workflow interview --topic "Design a database schema"
zouroboros workflow evaluate --seed seed.yaml --artifact ./src
zouroboros workflow unstuck --signal "same error keeps happening"

# Swarm campaigns
zouroboros swarm run --tasks campaign.json

# Persona creation
zouroboros persona create --name "Security Auditor" --domain security

# Self-healing
zouroboros heal introspect
zouroboros heal prescribe
zouroboros heal evolve

# Terminal dashboard
zouroboros tui
```

### Programmatic (TypeScript)

```typescript
import { Memory } from 'zouroboros-memory';
import { SwarmOrchestrator } from 'zouroboros-swarm';

// Initialize memory
const memory = new Memory({ dbPath: './memory.db' });

// Store a fact
await memory.store({
  entity: 'user',
  key: 'preference',
  value: 'TypeScript',
  category: 'preference',
  decayClass: 'permanent',
});

// Search memory
const results = await memory.search({ query: 'programming languages' });

// Run a swarm campaign
const orchestrator = new SwarmOrchestrator();
const results = await orchestrator.run({
  tasks: [
    { id: '1', persona: 'Backend Developer', task: 'Design API' },
    { id: '2', persona: 'Frontend Developer', task: 'Build UI', dependsOn: ['1'] },
  ],
});
```

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`zouroboros-core`](https://www.npmjs.com/package/zouroboros-core) | ![npm](https://img.shields.io/npm/v/zouroboros-core.svg) | Types, config, utilities |
| [`zouroboros-memory`](https://www.npmjs.com/package/zouroboros-memory) | ![npm](https://img.shields.io/npm/v/zouroboros-memory.svg) | Hybrid SQLite + vector memory |
| [`zouroboros-swarm`](https://www.npmjs.com/package/zouroboros-swarm) | ![npm](https://img.shields.io/npm/v/zouroboros-swarm.svg) | v5 orchestration: DAG execution, circuit breakers, tier-resolve |
| [`zouroboros-workflow`](https://www.npmjs.com/package/zouroboros-workflow) | ![npm](https://img.shields.io/npm/v/zouroboros-workflow.svg) | Interview, eval, unstuck, autoloop |
| [`zouroboros-selfheal`](https://www.npmjs.com/package/zouroboros-selfheal) | ![npm](https://img.shields.io/npm/v/zouroboros-selfheal.svg) | Introspection & evolution |
| [`zouroboros-personas`](https://www.npmjs.com/package/zouroboros-personas) | ![npm](https://img.shields.io/npm/v/zouroboros-personas.svg) | Persona creation framework |
| [`zouroboros-rag`](https://www.npmjs.com/package/zouroboros-rag) | ![npm](https://img.shields.io/npm/v/zouroboros-rag.svg) | RAG expansion toolkit |
| [`zouroboros-cli`](https://www.npmjs.com/package/zouroboros-cli) | ![npm](https://img.shields.io/npm/v/zouroboros-cli.svg) | Unified CLI |
| [`zouroboros-tui`](https://www.npmjs.com/package/zouroboros-tui) | ![npm](https://img.shields.io/npm/v/zouroboros-tui.svg) | Terminal dashboard |

## Architecture

<p align="center">
  <img src="./assets/zouroboros-architecture.png" alt="Zouroboros Architecture" width="100%" />
</p>

## Documentation

- **[Installation Guide](./docs/getting-started/installation.md)** — Get started in minutes
- **[Quick Start](./docs/getting-started/quickstart.md)** — Build your first project
- **[Architecture Overview](./docs/architecture/overview.md)** — System design
- **[CLI Reference](./docs/reference/cli-commands.md)** — Complete command reference
- **[CLI Commands Reference](./docs/reference/cli-commands.md)** — Programmatic usage and CLI reference

## Examples

See the `examples/` directory for complete projects:

- `basic-memory/` — Memory system fundamentals
- `swarm-campaign/` — Multi-agent orchestration
- `persona-creation/` — Building custom personas (see `packages/persona-creator/`)
- `self-healing/` — Autonomous improvement *(coming soon)*

## Configuration

Zouroboros uses a hierarchical configuration system:

```yaml
# ~/.zouroboros/config.yaml
defaults:
  memory:
    dbPath: ~/.zo/memory/shared-facts.db
    embeddingModel: nomic-embed-text
  
  swarm:
    localConcurrency: 8
    timeoutSeconds: 600
    routingStrategy: balanced
```

## Self-Healing

Zouroboros can monitor and improve itself:

```bash
# Run daily introspection
zouroboros heal introspect --store

# Generate improvement prescription
zouroboros heal prescribe --live

# Execute improvement
zouroboros heal evolve --prescription ./prescription.json
```

The system measures:
- Memory recall quality
- Graph connectivity
- Routing accuracy
- Evaluation calibration
- Procedure freshness
- Episode velocity

## Integration with Zo Computer

Zouroboros is designed to work seamlessly with Zo Computer:

```typescript
// In Zo chat, you can use natural language:
"Store that I prefer dark mode interfaces"
"What's my favorite programming language?"
"Run a spec-first interview for a new feature"
"Check my Zouroboros health"
```

The CLI and Zo chat interface are fully compatible — use whichever is more convenient.

## Development

```bash
# Clone the repository
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm test

# Start development mode
pnpm run dev
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Acknowledgments

- Inspired by [Q00/ouroboros](https://github.com/Q00/ouroboros) for spec-first development patterns
- Built natively on [Zo Computer](https://zo.computer) — [try Zo Computer](https://zo-computer.cello.so/IgX9SnGpKnR)
- Thanks to all contributors and the Zo community

---

**Made with ❤️ for the Zo Computer ecosystem**