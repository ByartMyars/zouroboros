# Installation Guide

> Get Zouroboros up and running in minutes

## Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/marlandoj/zouroboros/main/scripts/install.sh | bash
```

This will:
- Clone the repository
- Install dependencies
- Set up configuration
- Run health checks

## Manual Installation

### Prerequisites

- **Bun** (required): `curl -fsSL https://bun.sh/install | bash`
- **Node.js** 18+ (optional, for some tools)
- **Git**
- **SQLite** (usually pre-installed)

### Step 1: Clone the Repository

```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
```

### Step 2: Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all package dependencies
pnpm install

# Build all packages
pnpm run build
```

### Step 3: Initialize Configuration

```bash
# Run the setup wizard
./scripts/setup.sh

# Or use the CLI
pnpm zouroboros init
```

### Step 4: Verify Installation

```bash
# Run the doctor command
zouroboros doctor

# Should show all components as healthy
```

## Configuration

### Environment Variables

Zouroboros honors a small set of environment variables but runs fine with the
defaults. Create a `.env` file in your project root only if you need to override
them:

```bash
# Optional — defaults to ~/.zouroboros/memory.db
ZOUROBOROS_MEMORY_DB=/path/to/your/memory.db

# Optional — defaults to the current working directory
ZOUROBOROS_WORKSPACE=/path/to/your/project

# Optional — for cloud features
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

Legacy `ZO_MEMORY_DB` and `ZO_WORKSPACE` names are still accepted for
backwards compatibility.

### Zo Computer Integration

If you're using Zo Computer and want Zouroboros to share the same memory DB as
other Zo tooling, point it at `~/.zo/memory/shared-facts.db` by adding to your
`~/.bashrc` or `~/.zshrc`:

```bash
# Zouroboros CLI
export PATH="$PATH:/home/workspace/zouroboros/cli/bin"

# Zouroboros memory
alias zm='zouroboros memory'
alias zs='zouroboros swarm'
alias zp='zouroboros persona'
```

## Next Steps

- [Quick Start Tutorial](./quickstart.md) - Build your first project
- [Configuration Reference](../reference/configuration.md) - Advanced settings
- [CLI Commands](../reference/cli-commands.md) - Full command reference

## Troubleshooting

### Common Issues

**Issue**: `zouroboros: command not found`
**Solution**: Ensure the CLI is linked: `cd cli && pnpm link --global`

**Issue**: `Cannot find module 'zouroboros-core'`
**Solution**: Run `pnpm run build` from the root directory

**Issue**: SQLite errors
**Solution**: Ensure SQLite is installed: `sqlite3 --version`

### Getting Help

- Check the [Troubleshooting Guide](../reference/troubleshooting.md)
- Open an issue on GitHub
- Ask in the Zo Computer community