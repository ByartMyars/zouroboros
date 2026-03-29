# Phase 2: Cascade Mitigation

**Addresses**: 77.5% of swarm failures are cascade failures (March 2026 data: 62 of 80 failures)

---

## Problem

When a root task fails in a DAG execution, ALL downstream dependent tasks are marked failed - even if they could have produced useful output with partial inputs.

**Example**:
```
Task A (fails - API timeout)
  └── Task B (depends on A) → marked failed
      └── Task C (depends on B) → marked failed
          └── Task D → marked failed

Result: 1 real failure → 4 apparent failures
```

## Solution

Configurable cascade policies per task:

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `abort` | Mark dependent as failed, don't execute | Mutation tasks (write, delete) |
| `degrade` | Execute with partial inputs + warning | Analysis tasks (read, analyze) |
| `retry` | Retry failed dependency first | Transient failures |
| `skip` | Execute anyway, ignore failure | Fire-and-forget tasks |

---

## Usage

```typescript
import { CascadeAwareExecutor, CascadeMonitor } from './phase-2-cascade/src';

const executor = new CascadeAwareExecutor();
const monitor = new CascadeMonitor();

const tasks = [
  {
    id: 'fetch-data',
    dependencies: [],
    execute: async () => ({ success: true, output: { items: [...] } }),
  },
  {
    id: 'analyze',
    dependencies: ['fetch-data'],
    policy: { onDependencyFailure: 'degrade' },  // Continue even if data fetch fails
    execute: async (ctx) => {
      // Will execute with _degradedContext injected
      return { success: true, output: analyze(ctx) };
    },
  },
  {
    id: 'write-report',
    dependencies: ['analyze'],
    policy: { onDependencyFailure: 'abort' },  // Don't write if analysis failed
    execute: async (ctx) => {
      // Won't execute if analyze failed
      return writeReport(ctx);
    },
  },
];

const stats = await executor.execute(tasks);

// View cascade events
console.log(executor.getCascadeEvents());

// Generate recommendations
const report = monitor.generateReport();
console.log(report.recommendations);
```

---

## Degraded Execution

When `degrade` policy is active:

1. Task receives `_degradedContext` in execution context
2. Task receives `_failedDependencies` array
3. Task receives available inputs (from successful predecessors)
4. Task should prefix output with "DEGRADED:" to signal reduced quality

---

## Cascade Monitor

Track cascade patterns for learning:

```typescript
const monitor = new CascadeMonitor();
monitor.recordEvents(executor.getCascadeEvents());

const report = monitor.generateReport();
// report.recommendations contains actionable suggestions
```

---

## CLI Integration

Add to swarm orchestrator:

```bash
# In orchestrate-v5.ts, replace default execution with:
import { CascadeAwareExecutor } from '../phase-2-cascade/src';

const executor = new CascadeAwareExecutor();
const stats = await executor.execute(convertedTasks);
```

---

## Test Results

```
✅ Test 1: Basic execution - PASSED
✅ Test 2: Cascade abort - PASSED  
✅ Test 3: Degrade policy - PASSED
✅ Test 4: Cascade monitor - PASSED
```

---

## Files

| File | Purpose |
|------|---------|
| `src/cascade-policy.ts` | Policy engine (abort/degrade/retry/skip) |
| `src/dag-executor.ts` | Cascade-aware task executor |
| `src/cascade-monitor.ts` | Event tracking and recommendations |
| `src/index.ts` | CLI integration helpers |
| `tests/test-cascade.ts` | Unit tests |
