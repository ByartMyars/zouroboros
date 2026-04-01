<p align="center">
  <img src="./assets/zouroboros-hero-banner.png" alt="Zouroboros — Self-Enhancing AI Platform" width="100%" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/marlandoj/zouroboros"><img src="https://img.shields.io/badge/version-2.0.0-blue.svg" alt="Version" /></a>
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

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/marlandoj/zouroboros/main/scripts/install.sh | bash
```

### From Zo Chat

```
Initialize Zouroboros for me
```

### Manual Install

```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
pnpm install
pnpm run build
zouroboros init
zouroboros doctor
```

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

| Package | Description | CLI Command |
|---------|-------------|-------------|
| `zouroboros-core` | Types, config, utilities | - |
| `zouroboros-memory` | Hybrid SQLite + vector memory | `zouroboros-memory` |
| `zouroboros-workflow` | Interview, eval, unstuck, autoloop | `zouroboros-*` |
| `zouroboros-personas` | Persona creation framework | `zouroboros-personas` |
| `zouroboros-swarm` | Multi-agent orchestration | `zouroboros-swarm` |
| `zouroboros-selfheal` | Introspection & evolution | `zouroboros-introspect` |
| `zouroboros-cli` | Unified CLI | `zouroboros` |
| `zouroboros-tui` | Terminal dashboard | `zouroboros-tui` |

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
- `persona-creation/` — Building custom personas *(coming soon)*
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