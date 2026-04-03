# zouroboros-swarm

> Multi-agent orchestration with circuit breakers and 6-signal routing

## Features

- **Circuit Breaker V2** — CLOSED/OPEN/HALF_OPEN states with category-aware failure tracking
- **6-Signal Composite Routing** — Capability, health, complexity fit, history, procedure, temporal
- **Hierarchical Orchestration** — Hermes/Claude parent tasks can self-decompose under centralized delegation policy
- **Executor Bridges** — Claude Code, Hermes, Gemini, Codex CLI integration
- **DAG Execution** — Streaming and wave-based task execution modes
- **Registry-Based** — JSON registry for executor configuration

## Installation

```bash
npm install zouroboros-swarm
# or
pnpm add zouroboros-swarm
```

## Quick Start

```typescript
import { SwarmOrchestrator } from 'zouroboros-swarm';

const orchestrator = new SwarmOrchestrator({
  localConcurrency: 8,
  timeoutSeconds: 600,
  routingStrategy: 'balanced',
  dagMode: 'streaming',
});

const tasks = [
  { id: '1', persona: 'developer', task: 'Fix the auth bug in login.ts', priority: 'high' },
  { id: '2', persona: 'reviewer', task: 'Review the PR for error handling', priority: 'medium', dependsOn: ['1'] },
];

const results = await orchestrator.run(tasks);
```

## CLI Usage

```bash
# Run a swarm campaign
zouroboros-swarm ./tasks.json

# With options
zouroboros-swarm ./tasks.json --mode waves --concurrency 4 --strategy fast

# Inspect a completed run
zouroboros-swarm status <swarm-id>

# Inspect executor routing and delegation history
zouroboros-swarm history 10

# Health check
zouroboros-swarm doctor
```

`status <swarm-id>` now surfaces persisted hierarchical telemetry from the results file, including delegated parent count, child task count, artifact count, reroutes, and effective executors.

`history [limit]` reads `executor-history.db` and prints delegation-aware routing history per executor/category, including:
- base success rate
- delegated attempt/success rate
- child success rate
- average child count
- average child duration

## Task Format

```json
[
  {
    "id": "task-1",
    "persona": "developer",
    "task": "Implement user authentication",
    "priority": "high",
    "executor": "claude-code",
    "dependsOn": [],
    "timeoutSeconds": 600
  },
  {
    "id": "task-2",
    "persona": "tester",
    "task": "Write tests for auth",
    "priority": "medium",
    "dependsOn": ["task-1"]
  }
]
```

Hierarchical delegation is available through an optional `delegation` block on each task:

```json
{
  "id": "implementation-safe",
  "executor": "claude-code",
  "task": "Implement the parser cleanup and synthesize the result.",
  "delegation": {
    "mode": "auto",
    "maxChildren": 2,
    "writeScopes": [
      { "childId": "parser-a", "paths": ["src/parser/a.ts"] },
      { "childId": "parser-b", "paths": ["src/parser/b.ts"] }
    ]
  }
}
```

- `mode: "auto"` enables executor-side self-decomposition when policy allows it.
- Mutation tasks require disjoint `writeScopes`; otherwise they are forced to remain leaf tasks.
- Results now persist parent/child telemetry, including `delegated`, `effectiveExecutor`, `childRecords`, and artifact lists.

Example status output for a completed hierarchical run:

```text
🔍 Swarm Status: hierarchical-broader-validation-test
   Status: complete
   Results: ~/.swarm/results/hierarchical-broader-validation-test.json
   Outcome: 4/4 succeeded, 0 failed
   Duration: 4s
   Delegated: 3 parent / 5 child
   Artifacts: 4
   Reroutes: 1
   Executors: hermes, claude-code
```

## Routing Strategies

| Strategy | Best For | Weight Focus |
|----------|----------|--------------|
| `fast` | Quick iterations | Complexity fit (40%), Health (20%) |
| `reliable` | Production tasks | Health (35%), History (18%) |
| `balanced` | General use | Even distribution |
| `explore` | New domains | Capability (35%), Complexity (18%) |

## Circuit Breaker States

- **CLOSED** — Normal operation, requests pass through
- **OPEN** — Failure threshold exceeded, requests blocked
- **HALF_OPEN** — Testing if service recovered

## Executor Registry

Create `~/.zouroboros/executors.json`:

```json
{
  "executors": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "executor": "local",
      "bridge": "bridges/claude-code-bridge.sh",
      "expertise": ["code-generation", "debugging", "refactoring"],
      "bestFor": ["Complex multi-file changes"]
    }
  ]
}
```

## License

MIT
