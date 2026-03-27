# Architecture Overview

Zouroboros is designed as a modular, self-enhancing AI infrastructure platform.

## Design Principles

1. **Modularity** - Use only what you need
2. **Extensibility** - Plugin architecture for custom components
3. **Self-Healing** - Built-in diagnostics and improvement
4. **Developer Experience** - Simple CLI, clear docs, fast feedback

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Zouroboros CLI                           │
│                   (Command & Control Interface)                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼─────┐         ┌───────▼───────┐      ┌───────▼──────┐
   │  Memory  │         │     Swarm     │      │   Personas   │
   │  System  │         │ Orchestration │      │  Framework   │
   └────┬─────┘         └───────┬───────┘      └──────┬───────┘
        │                       │                     │
        │              ┌────────▼────────┐            │
        │              │    Executors    │            │
        │              │ • Claude Code   │            │
        │              │ • Codex CLI     │            │
        │              │ • Gemini CLI    │            │
        │              │ • Hermes Agent  │            │
        │              └─────────────────┘            │
        │                                             │
        └──────────────────┬──────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │   Self-Heal     │
                  │ • Introspect    │
                  │ • Prescribe     │
                  │ • Evolve        │
                  └─────────────────┘
```

## Package Structure

### Core (`zouroboros-core`)
- Shared types and interfaces
- Configuration management
- Constants and utilities

### Memory (`zouroboros-memory`)
- **Episodic Memory**: Conversation history, events
- **Procedural Memory**: Learned procedures, workflows
- **Cognitive Profiles**: Per-entity preferences and facts
- **Graph-boosted Search**: Semantic + relational queries
- **HyDE Expansion**: Hypothetical document embeddings

### Swarm (`zouroboros-swarm`)
- **6-Signal Routing**: Complexity, context, cost, confidence, continuity, capability
- **DAG Streaming**: Dependency-aware parallel execution
- **Executor Bridges**: Unified interface to local agents
- **OmniRoute Integration**: Fallback to cloud models

### Personas (`zouroboros-personas`)
- **8-Phase Creation**: Planning → Deployment
- **Template System**: Reusable persona patterns
- **SkillsMP Integration**: Community skill discovery
- **MCP Wrappers**: AI tool integration

### Self-Heal (`zouroboros-selfheal`)
- **Introspect**: Health scorecard across all subsystems
- **Prescribe**: Generate improvement plans
- **Evolve**: Execute autonomous improvements

## Data Flow

### Memory Capture
```
Conversation → Auto-Capture → HyDE Expansion → Vector DB
                                              ↓
                                         Graph Relations
```

### Swarm Execution
```
Tasks YAML → Parse DAG → 6-Signal Router → Executor Pool
                                              ↓
                                      Streaming Results
```

### Self-Healing
```
Introspect → Scorecard → Prescribe → Seed YAML → Autoloop
                                                  ↓
                                        Measure & Evolve
```

## Configuration

All packages share a unified configuration system:

```typescript
// ~/.zouroboros/config.json
{
  "version": "2.0.0",
  "memory": { /* memory-specific settings */ },
  "swarm": { /* swarm-specific settings */ },
  "personas": { /* persona-specific settings */ },
  "selfheal": { /* self-healing settings */ }
}
```

## Extension Points

### Plugins
Add new capabilities without modifying core:

```bash
zouroboros plugin install n8n
zouroboros plugin install code-server
```

### Custom Executors
Implement the bridge protocol to add new agents:

```bash
# bridges/my-custom-agent.sh
#!/bin/bash
# Your agent integration here
```

### MCP Servers
Integrate external AI tools:

```typescript
// ~/.zouroboros/mcp/my-mcp.json
{
  "name": "my-mcp",
  "url": "http://localhost:3001/sse"
}
```
