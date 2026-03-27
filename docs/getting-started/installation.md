# Installation

Zouroboros can be installed in several ways depending on your needs.

## Prerequisites

- **Node.js** >= 18.0.0
- **Bun** >= 1.0.0 (for running TypeScript scripts)
- **Ollama** (for local embeddings)

## Option 1: npx (Recommended)

The fastest way to get started:

```bash
npx zouroboros onboard --yes
```

This will:
1. Detect your environment
2. Install dependencies if needed
3. Initialize configuration
4. Run health checks

## Option 2: Docker Compose

For a containerized setup:

```bash
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros
docker-compose up -d
```

This includes:
- Zouroboros platform
- PostgreSQL (for memory storage)
- Ollama (for embeddings)
- Web UI

## Option 3: Manual Installation

```bash
# Clone the repository
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Initialize configuration
./cli/bin/zouroboros init

# Run health check
./cli/bin/zouroboros doctor
```

## Option 4: npm Global Install

```bash
npm install -g zouroboros-cli
zouroboros init
zouroboros doctor
```

## Verification

After installation, verify everything is working:

```bash
zouroboros doctor
```

You should see output like:
```
✓ Node.js v20.11.0
✓ Bun 1.0.26
✓ Ollama running on localhost:11434
✓ Configuration file exists
```

## Next Steps

- [Quick Start Guide](./quickstart.md)
- [Configuration](./configuration.md)
- [CLI Reference](../reference/cli-commands.md)
