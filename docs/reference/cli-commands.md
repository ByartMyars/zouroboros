# CLI Reference

## Global Options

```
-v, --version   Output version number
-h, --help      Display help for command
```

## Commands

### `init`

Initialize Zouroboros configuration.

```bash
zouroboros init [options]
```

**Options:**
- `-f, --force` - Overwrite existing configuration

**Example:**
```bash
zouroboros init
zouroboros init --force
```

### `doctor`

Check system health and dependencies.

```bash
zouroboros doctor
```

**Checks:**
- Node.js version
- Bun installation
- Ollama accessibility
- Configuration validity

### `config get`

Get a configuration value.

```bash
zouroboros config get <key>
```

**Example:**
```bash
zouroboros config get memory.ollamaUrl
# Output: http://localhost:11434
```

### `config set`

Set a configuration value.

```bash
zouroboros config set <key> <value>
```

**Example:**
```bash
zouroboros config set memory.ollamaUrl http://host.docker.internal:11434
zouroboros config set swarm.localConcurrency 8
```

### `config list`

List all configuration values.

```bash
zouroboros config list
zouroboros config ls
```

### `config edit`

Open configuration in $EDITOR.

```bash
zouroboros config edit
```

### `memory`

Memory system commands (coming in v2.1.0).

```bash
zouroboros memory <subcommand>
```

**Subcommands:**
- `store` - Store a memory fact
- `search` - Search memories
- `hybrid` - Hybrid semantic + exact search
- `episodes` - List episodes
- `graph` - Knowledge graph operations

### `swarm`

Swarm orchestration commands (coming in v2.1.0).

```bash
zouroboros swarm <subcommand>
```

**Subcommands:**
- `run` - Execute a task DAG
- `status` - View swarm status
- `executor` - Manage executors

### `persona`

Persona management commands (coming in v2.1.0).

```bash
zouroboros persona <subcommand>
```

**Subcommands:**
- `create` - Create a new persona
- `list` - List personas
- `validate` - Validate persona configuration

### `introspect`

Run self-diagnostics (coming in v2.1.0).

```bash
zouroboros introspect [options]
```

**Options:**
- `--json` - Output as JSON
- `--store` - Store results as episode
- `--verbose` - Detailed output

### `prescribe`

Generate improvement prescriptions (coming in v2.1.0).

```bash
zouroboros prescribe [options]
```

**Options:**
- `--scorecard <path>` - Use specific scorecard
- `--live` - Run introspect first
- `--target <metric>` - Target specific metric

### `evolve`

Execute improvement prescriptions (coming in v2.1.0).

```bash
zouroboros evolve [options]
```

**Options:**
- `--prescription <path>` - Use specific prescription
- `--auto` - Run in fully autonomous mode
- `--dry-run` - Show what would be executed

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZOUROBOROS_CONFIG_PATH` | Config file path | `~/.zouroboros/config.json` |
| `EDITOR` | Editor for `config edit` | `vi` |

## Configuration Keys

See [Configuration](../getting-started/configuration.md) for all available configuration keys.
