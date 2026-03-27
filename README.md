# Zouroboros 🐍⭕

> A self-enhancing AI memory and orchestration system for Zo Computer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Zouroboros brings together everything you need to supercharge your Zo Computer:
- **Memory System** — Remember conversations, facts, and events
- **Swarm Orchestration** — Coordinate multiple AI agents
- **OmniRoute Integration** — Intelligent model selection
- **Spec-First Workflow** — Plan before you build
- **Self-Healing** — Automatically improve over time

---

## 🚀 Quick Start (One Command)

```bash
curl -fsSL https://raw.githubusercontent.com/marlandoj/zouroboros/main/scripts/install.sh | bash
```

Or manually:

```bash
# Clone the repository
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Initialize Zouroboros
pnpm cli init

# Check everything is working
pnpm cli doctor
```

---

## 💬 Using Zouroboros

You can use Zouroboros in two ways:

### 1. Natural Language in Zo Chat

Just talk to Zo naturally:

```
Remember that I prefer dark mode for all my dashboards
```

```
Search my memory for anything about the trading bot project
```

```
Run a swarm campaign to review my codebase
```

```
Create a new persona called "Code Reviewer"
```

### 2. Command Line Interface (CLI)

Use the terminal for precise control:

```bash
# Store a fact
zouroboros memory store --entity "user" --key "preference" --value "dark mode"

# Search memory
zouroboros memory search "trading bot"

# Run a swarm campaign
zouroboros swarm run --campaign review.yaml

# Create a persona
zouroboros persona create --name "Code Reviewer"

# Check system health
zouroboros doctor
```

---

## 📦 What's Included

| Package | Purpose | Zo Chat | CLI |
|---------|---------|---------|-----|
| **zouroboros-core** | Types, config, utilities | — | — |
| **zouroboros-memory** | SQLite + Vector memory | "Remember..." | `memory` |
| **zouroboros-omniroute** | Model routing | automatic | `omniroute` |
| **zouroboros-swarm** | Multi-agent orchestration | "Run swarm..." | `swarm` |
| **zouroboros-personas** | Persona creation | "Create persona..." | `persona` |
| **zouroboros-workflow** | Spec-first, eval, unstuck | "Run interview..." | `workflow` |
| **zouroboros-selfheal** | Auto-improvement | background | `selfheal` |
| **zouroboros-cli** | Unified CLI | — | `zouroboros` |
| **zouroboros-tui** | Terminal UI | — | `zouroboros-tui` |

---

## 🧠 Memory System Examples

### Store a Memory

**Zo Chat:**
```
Remember that my database password is in /home/.z/secrets
```

**CLI:**
```bash
zouroboros memory store \
  --entity "user" \
  --key "db_password_location" \
  --value "/home/.z/secrets" \
  --category "reference" \
  --decay permanent
```

### Search Memories

**Zo Chat:**
```
What do I remember about database passwords?
```

**CLI:**
```bash
zouroboros memory search "database password"
zouroboros memory hybrid "database password"  # Hybrid search
```

### Record an Event

**Zo Chat:**
```
Record that I finished the trading bot integration today
```

**CLI:**
```bash
zouroboros memory episode \
  --summary "Finished trading bot integration" \
  --outcome success \
  --entities "trading-bot" "alpaca"
```

---

## 🐝 Swarm Orchestration Examples

### Run a Campaign

**Zo Chat:**
```
Run a swarm campaign to analyze my codebase for security issues
```

**CLI:**
```bash
zouroboros swarm run --file security-audit.yaml
```

Example campaign file (`security-audit.yaml`):
```yaml
name: Security Audit
tasks:
  - name: Check for secrets
    prompt: Search for API keys, passwords, or tokens in the codebase
    executor: local
    combo: swarm-light
  
  - name: Analyze dependencies
    prompt: Check package.json for known vulnerabilities
    executor: local
    combo: swarm-light
    depends_on: [Check for secrets]
```

### Check Campaign Status

**Zo Chat:**
```
What's the status of my security audit campaign?
```

**CLI:**
```bash
zouroboros swarm status
```

---

## 👤 Persona Examples

### Create a Persona

**Zo Chat:**
```
Create a persona called "Security Expert" that reviews code for vulnerabilities
```

**CLI:**
```bash
zouroboros persona create \
  --name "Security Expert" \
  --domain "security" \
  --description "Reviews code for security vulnerabilities"
```

### List Personas

**Zo Chat:**
```
What personas do I have?
```

**CLI:**
```bash
zouroboros persona list
```

### Activate a Persona

**Zo Chat:**
```
Switch to the Security Expert persona
```

**CLI:**
```bash
zouroboros persona activate "Security Expert"
```

---

## 🔍 Workflow Examples

### Spec-First Interview

**Zo Chat:**
```
I want to build a webhook retry system. Run a spec-first interview first.
```

**CLI:**
```bash
zouroboros workflow interview \
  --topic "Build a webhook retry system" \
  --output seed.yaml
```

### Three-Stage Evaluation

**Zo Chat:**
```
Evaluate my implementation against the seed specification
```

**CLI:**
```bash
zouroboros workflow evaluate \
  --seed seed.yaml \
  --artifact ./src
```

### Get Unstuck

**Zo Chat:**
```
I'm stuck on this error. Help me get unstuck.
```

**CLI:**
```bash
zouroboros workflow unstuck \
  --problem "Database connection keeps failing" \
  --persona hacker
```

---

## 🏥 Self-Heal Examples

### Run Introspection

**Zo Chat:**
```
Run a health check on my Zouroboros system
```

**CLI:**
```bash
zouroboros selfheal introspect
```

### Generate Prescription

**Zo Chat:**
```
What should I improve based on my health score?
```

**CLI:**
```bash
zouroboros selfheal prescribe
```

---

## 🖥️ Terminal UI

Launch the interactive terminal UI:

```bash
zouroboros-tui
```

Navigate with arrow keys:
- **Memory** — View stats, search, browse episodes
- **Swarm** — Monitor campaigns, view results
- **Config** — Edit settings interactively
- **Doctor** — Run health checks

---

## ⚙️ Configuration

Configuration is stored in `~/.config/zouroboros/config.json`.

### View Configuration

**Zo Chat:**
```
Show me my Zouroboros configuration
```

**CLI:**
```bash
zouroboros config get
zouroboros config get memory.autoCapture
```

### Update Configuration

**Zo Chat:**
```
Enable auto-capture for my conversations
```

**CLI:**
```bash
zouroboros config set memory.autoCapture true
zouroboros config set memory.captureIntervalMinutes 15
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Zouroboros CLI                         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    Memory     │    │    Swarm      │    │   Workflow    │
│   System      │    │ Orchestrator  │    │    Tools      │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                       Core Services                         │
│  (Config, Types, OmniRoute, Personas, Self-Heal)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation

- [Installation Guide](docs/getting-started/installation.md)
- [Quick Start Tutorial](docs/getting-started/quickstart.md)
- [Architecture Overview](docs/architecture/overview.md)
- [CLI Reference](docs/reference/cli-commands.md)
- [API Documentation](docs/reference/api.md)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [OmniRoute](https://github.com/zenphi/OmniRoute) for model routing
- [Ouroboros](https://github.com/Q00/ouroboros) for spec-first patterns
- [Agency Agents](https://github.com/msitarzewski/agency-agents) for persona templates
- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) for autoloop inspiration
