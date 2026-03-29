/**
 * Phase 2: Cascade Mitigation - CLI Integration
 * 
 * Integration module for cascade-aware execution into the swarm orchestrator.
 */

import { CascadeAwareExecutor, type Task, type ExecutionStats } from './dag-executor';
import { CascadeMonitor, type CascadeReport } from './cascade-monitor';
import { CascadePolicy, DEFAULT_TASK_POLICY } from './cascade-policy';

export { CascadeAwareExecutor, CascadeMonitor, CascadePolicy, DEFAULT_TASK_POLICY };
export type { CascadeReport, ExecutionStats, Task };

/**
 * Execute a task list with cascade mitigation
 */
export async function executeWithCascade(
  tasks: Task[],
  options?: {
    logToMemory?: boolean;
    monitor?: CascadeMonitor;
  }
): Promise<ExecutionStats> {
  const executor = new CascadeAwareExecutor();
  const stats = await executor.execute(tasks);
  
  // Log cascade events to monitor
  if (options?.monitor) {
    options.monitor.recordEvents(executor.getCascadeEvents());
  }
  
  // Optionally log to memory system
  if (options?.logToMemory) {
    await logCascadeToMemory(executor.getCascadeEvents());
  }
  
  return stats;
}

/**
 * Log cascade events to zo-memory-system
 */
async function logCascadeToMemory(events: { timestamp: Date; taskId: string; failedDependencyId: string; policy: string; decision: string; reason: string }[]): Promise<void> {
  // Import memory system script
  const { execSync } = await import('child_process');
  
  for (const event of events) {
    try {
      const cmd = [
        'bun',
        '/home/workspace/Skills/zo-memory-system/scripts/memory.ts',
        'store',
        '--entity', 'cascade',
        '--value', JSON.stringify({
          taskId: event.taskId,
          failedDependencyId: event.failedDependencyId,
          policy: event.policy,
          decision: event.decision,
          reason: event.reason,
        }),
        '--decay', 'medium',
      ];
      
      execSync(cmd.join(' '), { stdio: 'ignore' });
    } catch {
      // Silently fail if memory system unavailable
    }
  }
}

/**
 * Example: Convert legacy task to cascade-aware task
 */
export function createCascadeTask(
  id: string,
  prompt: string,
  dependencies: string[],
  policy?: Partial<typeof DEFAULT_TASK_POLICY>
): Task {
  return {
    id,
    dependencies,
    input: { prompt },
    execute: async (ctx) => {
      // In real impl, this would call the executor bridge
      return {
        success: true,
        output: { result: `Task ${id} completed with inputs: ${JSON.stringify(ctx)}` },
      };
    },
    policy,
  };
}

/**
 * Analyze a potential cascade before execution
 */
export function analyzePotentialCascade(
  tasks: Task[],
  failedTaskId: string
): { affectedTasks: string[]; canRecover: boolean; recommendedPolicy: CascadePolicy } {
  const affected = new Set<string>();
  
  // Find all tasks that depend on the failed task
  function findDependents(taskId: string) {
    for (const task of tasks) {
      if (task.dependencies.includes(taskId) && !affected.has(task.id)) {
        affected.add(task.id);
        findDependents(task.id);
      }
    }
  }
  
  findDependents(failedTaskId);
  
  return {
    affectedTasks: Array.from(affected),
    canRecover: affected.size > 0,
    recommendedPolicy: affected.size > 3 ? 'degrade' : 'abort',
  };
}

// CLI usage example
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`
Cascade Mitigation Module
========================

Usage in your swarm orchestrator:

  import { executeWithCascade, CascadeMonitor } from './phase-2-cascade/src';

  const tasks = [
    createCascadeTask('task-1', 'Analyze data', []),
    createCascadeTask('task-2', 'Generate report', ['task-1'], {
      onDependencyFailure: 'degrade'
    }),
  ];

  const monitor = new CascadeMonitor();
  const stats = await executeWithCascade(tasks, { monitor, logToMemory: true });

  // Generate report
  const report = monitor.generateReport();
  console.log(report);
`);
}

export default {
  executeWithCascade,
  createCascadeTask,
  analyzePotentialCascade,
  CascadeAwareExecutor,
  CascadeMonitor,
};
