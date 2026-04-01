# zouroboros-cli

> Unified command-line interface for Zouroboros

## Installation

```bash
npm install -g zouroboros-cli
```

Or use locally:

```bash
npx zouroboros
```

## Quick Start

```bash
# Initialize Zouroboros
zouroboros init

# Check health
zouroboros doctor

# Launch dashboard
zouroboros tui
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize configuration |
| `doctor` | Health check |
| `config` | Manage configuration |
| `memory` | Memory system commands |
| `swarm` | Swarm orchestration |
| `persona` | Persona management |
| `workflow` | Interview, evaluate, autoloop |
| `heal` | Self-healing system |
| `tui` | Launch dashboard |

## Examples

```bash
# Initialize
zouroboros init

# Search memory
zouroboros memory search "project requirements"

# Run swarm campaign
zouroboros swarm run tasks.json --strategy reliable

# Create persona
zouroboros persona create "Health Coach" --domain healthcare --interactive

# Run introspection
zouroboros heal introspect --store

# Launch TUI dashboard
zouroboros tui
```