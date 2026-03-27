# Zouroboros 🐍⭕

> A self-enhancing AI memory and orchestration system for Zo Computer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Zouroboros is a comprehensive AI infrastructure platform that brings together memory systems, multi-agent orchestration, persona management, and self-healing capabilities into a unified, easy-to-install package.

## 🚀 Quick Start

### Option 1: npx (Fastest)
```bash
npx zouroboros onboard --yes
```

### Option 2: Docker Compose
```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
docker-compose up -d
```

### Option 3: Manual Install
```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
./scripts/onboard.sh
```

## 📦 Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`zouroboros-core`](./packages/core) | Core types, config, and utilities | ![npm](https://img.shields.io/npm/v/zouroboros-core) |
| [`zouroboros-memory`](./packages/memory) | Hybrid SQLite + Vector memory system | ![npm](https://img.shields.io/npm/v/zouroboros-memory) |
| [`zouroboros-swarm`](./packages/swarm) | Multi-agent orchestration and routing | ![npm](https://img.shields.io/npm/v/zouroboros-swarm) |
| [`zouroboros-personas`](./packages/personas) | Persona creation and management | ![npm](https://img.shields.io/npm/v/zouroboros-personas) |
| [`zouroboros-selfheal`](./packages/selfheal) | Self-diagnostic and evolution system | ![npm](https://img.shields.io/npm/v/zouroboros-selfheal) |
| [`zouroboros-cli`](./cli) | Unified command-line interface | ![npm](https://img.shields.io/npm/v/zouroboros-cli) |

## 🛠️ CLI Usage

```bash
# Initialize Zouroboros
zouroboros init

# Memory commands
zouroboros memory store --entity "user" --key "pref" --value "value"
zouroboros memory search "query"
zouroboros memory hybrid "semantic query"

# Swarm orchestration
zouroboros swarm run --file tasks.yaml
zouroboros swarm status

# Persona management
zouroboros persona create --name "HealthCoach" --domain healthcare

# Self-healing pipeline
zouroboros introspect
zouroboros prescribe
zouroboros evolve --auto

# System health
zouroboros doctor
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Zouroboros CLI                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
┌───▼────┐      ┌──────▼──────┐     ┌──────▼─────┐
│ Memory │      │    Swarm    │     │  Personas  │
└───┬────┘      └──────┬──────┘     └──────┬─────┘
    │                  │                   │
    │           ┌──────▼──────┐            │
    │           │  Executors  │            │
    │           │ • Claude    │            │
    │           │ • Codex     │            │
    │           │ • Gemini    │            │
    │           │ • Hermes    │            │
    │           └─────────────┘            │
    │                                      │
    └──────────────────┬───────────────────┘
                       │
              ┌────────▼────────┐
              │   Self-Heal     │
              │ • Introspect    │
              │ • Prescribe     │
              │ • Evolve        │
              └─────────────────┘
```

## 📚 Documentation

- [Getting Started](./docs/getting-started/installation.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [API Reference](./docs/reference/cli-commands.md)
- [Examples](./docs/examples/)

## 🔧 Configuration

Configuration is stored in `~/.zouroboros/config.json`:

```json
{
  "version": "2.0.0",
  "memory": {
    "enabled": true,
    "ollamaUrl": "http://localhost:11434",
    "embeddingModel": "nomic-embed-text"
  },
  "swarm": {
    "enabled": true,
    "localConcurrency": 4,
    "executors": ["claude-code", "codex", "gemini", "hermes"]
  },
  "selfheal": {
    "enabled": true,
    "autoEvolve": false
  }
}
```

## 🧪 Development

```bash
# Clone and install
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT © [marlandoj](https://github.com/marlandoj)
