# SWARM-bench: Swarm Orchestrator Evaluation Harness

**Phase 1 of Swarm Orchestrator Enhancement Backlog**

A Docker-free evaluation harness for validating swarm orchestrator task quality through reproducible benchmark instances.

## Quick Start

```bash
# Navigate to phase-1 directory
cd /home/workspace/zouroboros/projects/swarm-orchestrator-backlog/phase-1-swarm-bench

# List available benchmarks
bun src/swarm-bench.ts list

# Run a specific benchmark
bun src/swarm-bench.ts run --instance code-review-pr-author

# Run all benchmarks
bun src/swarm-bench.ts run --all

# Generate report
bun src/swarm-bench.ts report
```

## Architecture

```
phase-1-swarm-bench/
├── benchmarks/
│   ├── benchmark-schema.ts    # JSON schema for benchmark instances
│   └── sample-instance.json   # Example benchmark
├── src/
│   ├── workspace-isolation.ts # Git worktree isolation
│   └── swarm-bench.ts        # Main harness
├── docs/
│   └── acceptance-criteria.md # AC type documentation
└── README.md
```

## Benchmark Instance Format

Each benchmark is a JSON file containing:

```json
{
  "id": "unique-benchmark-id",
  "name": "Human-readable name",
  "category": "code-review|refactoring|bug-fix|...",
  "difficulty": "easy|medium|hard|expert",
  "task": {
    "prompt": "The task to give the swarm",
    "context": "Optional background context",
    "constraints": ["Optional requirements"]
  },
  "acceptanceCriteria": [
    {
      "id": "ac-1",
      "description": "What this AC checks",
      "type": "content-contains|file-exists|...",
      "config": { ... }
    }
  ],
  "workspaceSetup": {
    "files": { "path/to/file": "content" },
    "directories": ["dir1", "dir2"]
  },
  "metadata": {
    "author": "who",
    "createdAt": "ISO date",
    "tags": ["tag1"],
    "avgDurationSeconds": 45
  }
}
```

## Acceptance Criteria Types

| Type | Description | Config |
|------|-------------|--------|
| `content-contains` | Output contains expected text | `{ expected: "string" }` |
| `content-regex` | Output matches regex pattern | `{ pattern: "regex" }` |
| `file-exists` | Specific file was created | `{ filePath: "path" }` |
| `file-not-exists` | File should NOT exist | `{ filePath: "path" }` |
| `no-error-pattern` | Output should not contain error | `{ pattern: "regex" }` |
| `all-of` | All sub-criteria pass | `{ criteria: [...] }` |
| `any-of` | Any sub-criteria passes | `{ criteria: [...] }` |

## Workspace Isolation

Each benchmark runs in an isolated Git worktree:

1. Creates a new branch from main
2. Sets up initial files from `workspaceSetup`
3. Executes the swarm task
4. Captures output and final state
5. Cleans up worktree

This ensures benchmarks don't interfere with each other or the main repo.

## Adding New Benchmarks

1. Create a new JSON file in `benchmarks/`
2. Follow the schema in `benchmark-schema.ts`
3. Test with: `bun src/swarm-bench.ts run --instance your-id`
4. Add to version control

## Success Metrics

- ✅ Benchmark runs complete without manual intervention
- ✅ AC verification accuracy >95%
- ✅ Can detect quality regressions between swarm versions
- ✅ Executor benchmarking enables data-driven routing

---

*Next: Phase 2 - Dependency Cascade Mitigation*
