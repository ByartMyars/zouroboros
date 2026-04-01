/**
 * DAG execution engine
 *
 * Executes tasks in dependency order using streaming or wave-based modes.
 * Integrates CascadeManager for failure handling and ContextSharingManager
 * for passing context between dependent tasks.
 */

import type { Task, TaskResult, SwarmConfig } from '../types.js';
import type { BridgeExecutor } from '../executor/bridge.js';
import type { CascadeManager } from '../cascade/manager.js';
import type { ContextSharingManager } from '../context/sharing.js';

export type ExecutionMode = 'streaming' | 'waves';

export interface ExecutionContext {
  config: SwarmConfig;
  getExecutor: (executorId: string) => BridgeExecutor | undefined;
  cascadeManager?: CascadeManager;
  contextManager?: ContextSharingManager;
}

export interface ExecutionProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  percentComplete: number;
}

export class DAGExecutor {
  private tasks: Map<string, Task>;
  private results: Map<string, TaskResult>;
  private inProgress: Set<string>;
  private context: ExecutionContext;

  constructor(tasks: Task[], context: ExecutionContext) {
    this.tasks = new Map(tasks.map(t => [t.id, t]));
    this.results = new Map();
    this.inProgress = new Set();
    this.context = context;

    // Build cascade dependency graph if manager is provided
    if (context.cascadeManager) {
      context.cascadeManager.buildDependencyGraph(tasks);
    }
  }

  async execute(mode: ExecutionMode): Promise<TaskResult[]> {
    if (mode === 'streaming') {
      return this.executeStreaming();
    } else {
      return this.executeWaves();
    }
  }

  private async executeStreaming(): Promise<TaskResult[]> {
    const pending = new Set(this.tasks.keys());
    const promiseToTask = new Map<Promise<void>, string>();
    const maxConcurrency = this.context.config.localConcurrency;

    const tryExecuteTask = async (taskId: string): Promise<void> => {
      const task = this.tasks.get(taskId);
      if (!task) return;

      // Skip tasks that cascade manager has marked
      if (this.context.cascadeManager?.isSkipped(taskId)) {
        this.results.set(taskId, {
          task,
          success: false,
          error: 'Skipped due to upstream failure (cascade)',
          durationMs: 0,
          retries: 0,
        });
        pending.delete(taskId);
        return;
      }

      // Check dependencies
      const depsSatisfied = (task.dependsOn || []).every(depId =>
        this.results.has(depId) && this.results.get(depId)!.success
      );

      if (!depsSatisfied) return;
      if (this.results.has(taskId)) { pending.delete(taskId); return; }
      if (this.inProgress.has(taskId)) return;

      this.inProgress.add(taskId);
      pending.delete(taskId);

      try {
        const executor = this.context.getExecutor(task.executor || 'claude-code');
        if (!executor) {
          this.results.set(taskId, {
            task, success: false,
            error: `Executor ${task.executor} not found`,
            durationMs: 0, retries: 0,
          });
          return;
        }

        // Build task context from dependencies if context manager is available
        let taskContext: Record<string, unknown> | undefined;
        if (this.context.contextManager) {
          taskContext = this.context.contextManager.buildTaskContext(taskId, task.dependsOn || []);
        }

        const result = await executor.execute(task, {
          timeoutMs: (task.timeoutSeconds || this.context.config.timeoutSeconds) * 1000,
          ...(taskContext ? { context: taskContext } : {}),
        });

        this.results.set(taskId, result);

        if (result.success) {
          // Record output for downstream tasks
          this.context.contextManager?.recordTaskOutput(
            taskId, result.output || '', true
          );
        } else {
          // Handle failure through cascade manager
          if (this.context.cascadeManager) {
            this.context.cascadeManager.handleFailure(taskId, result.error || 'Unknown error');
            const { retry, backoffMs } = this.context.cascadeManager.shouldRetry(taskId);
            if (retry) {
              await new Promise(r => setTimeout(r, backoffMs));
              this.results.delete(taskId);
              this.inProgress.delete(taskId);
              pending.add(taskId);
              return;
            }
          }

          if (this.context.config.notifyOnComplete !== 'none') {
            console.error(`Task ${taskId} failed: ${result.error}`);
          }
        }
      } finally {
        this.inProgress.delete(taskId);
      }
    };

    // Main execution loop
    while (pending.size > 0 || promiseToTask.size > 0) {
      const availableSlots = maxConcurrency - promiseToTask.size;
      const readyTasks = Array.from(pending).filter(taskId => {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        if (this.context.cascadeManager?.isSkipped(taskId)) return true;
        return (task.dependsOn || []).every(depId =>
          this.results.has(depId) && this.results.get(depId)!.success
        );
      }).slice(0, availableSlots);

      for (const taskId of readyTasks) {
        const promise = tryExecuteTask(taskId);
        promiseToTask.set(promise, taskId);
        promise.finally(() => promiseToTask.delete(promise));
      }

      if (promiseToTask.size > 0) {
        await Promise.race(promiseToTask.keys());
      } else if (pending.size > 0) {
        break;
      }
    }

    return Array.from(this.results.values());
  }

  private async executeWaves(): Promise<TaskResult[]> {
    const remaining = new Set(this.tasks.keys());
    let wave = 0;

    while (remaining.size > 0) {
      wave++;

      const readyTasks = Array.from(remaining).filter(taskId => {
        if (this.context.cascadeManager?.isSkipped(taskId)) return true;
        const task = this.tasks.get(taskId);
        if (!task) return false;
        return (task.dependsOn || []).every(depId =>
          this.results.has(depId) && this.results.get(depId)!.success
        );
      });

      if (readyTasks.length === 0) break;

      console.log(`Wave ${wave}: Executing ${readyTasks.length} tasks`);

      const chunks = this.chunkArray(readyTasks, this.context.config.localConcurrency);

      for (const chunk of chunks) {
        const promises = chunk.map(async (taskId) => {
          const task = this.tasks.get(taskId)!;
          remaining.delete(taskId);

          // Skip cascaded tasks
          if (this.context.cascadeManager?.isSkipped(taskId)) {
            this.results.set(taskId, {
              task, success: false,
              error: 'Skipped due to upstream failure (cascade)',
              durationMs: 0, retries: 0,
            });
            return;
          }

          const executor = this.context.getExecutor(task.executor || 'claude-code');
          if (!executor) {
            this.results.set(taskId, {
              task, success: false,
              error: `Executor ${task.executor} not found`,
              durationMs: 0, retries: 0,
            });
            return;
          }

          // Build context from dependencies
          let taskContext: Record<string, unknown> | undefined;
          if (this.context.contextManager) {
            taskContext = this.context.contextManager.buildTaskContext(taskId, task.dependsOn || []);
          }

          const result = await executor.execute(task, {
            timeoutMs: (task.timeoutSeconds || this.context.config.timeoutSeconds) * 1000,
            ...(taskContext ? { context: taskContext } : {}),
          });

          this.results.set(taskId, result);

          if (result.success) {
            this.context.contextManager?.recordTaskOutput(
              taskId, result.output || '', true
            );
          } else if (this.context.cascadeManager) {
            this.context.cascadeManager.handleFailure(taskId, result.error || 'Unknown error');
          }
        });

        await Promise.all(promises);
      }
    }

    // Mark remaining tasks as failed
    for (const taskId of remaining) {
      const task = this.tasks.get(taskId)!;
      this.results.set(taskId, {
        task, success: false,
        error: 'Dependencies not satisfied or circular dependency detected',
        durationMs: 0, retries: 0,
      });
    }

    return Array.from(this.results.values());
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  getProgress(): ExecutionProgress {
    const total = this.tasks.size;
    const completed = Array.from(this.results.values()).filter(r => r.success).length;
    const failed = Array.from(this.results.values()).filter(r => !r.success).length;

    return {
      totalTasks: total,
      completedTasks: completed,
      failedTasks: failed,
      inProgressTasks: this.inProgress.size,
      percentComplete: Math.round(((completed + failed) / total) * 100),
    };
  }
}
