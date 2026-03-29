/**
 * DAG Executor with Cascade Mitigation
 * 
 * Executes tasks in dependency order with configurable failure handling.
 * Tracks cascade events and logs them for analysis.
 */

import { analyzeCascade, createDegradedContext, type TaskPolicy, type CascadeDecision, DEFAULT_TASK_POLICY } from './cascade-policy';

export interface Task {
  id: string;
  dependencies: string[];
  execute: (context: Record<string, unknown>) => Promise<TaskResult>;
  policy?: Partial<TaskPolicy>;
  input?: unknown;
  expectedInputs?: string[];
}

export interface TaskResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs?: number;
  warnings?: string[];
  degraded?: boolean;
}

export interface CascadeEvent {
  timestamp: Date;
  taskId: string;
  failedDependencyId: string;
  policy: string;
  decision: 'execute' | 'skip' | 'retry' | 'abort';
  reason: string;
}

export interface ExecutionStats {
  totalTasks: number;
  completed: number;
  failed: number;
  degraded: number;
  skipped: number;
  cascadeEvents: CascadeEvent[];
  executionOrder: string[];
}

export class CascadeAwareExecutor {
  private results: Map<string, TaskResult> = new Map();
  private taskResults: Map<string, unknown> = new Map();
  private cascadeEvents: CascadeEvent[] = [];
  private executionOrder: string[] = [];
  
  /**
   * Execute tasks in topological order with cascade mitigation
   */
  async execute(tasks: Task[]): Promise<ExecutionStats> {
    // Build dependency graph
    const graph = this.buildGraph(tasks);
    
    // Get execution order (topological sort)
    const order = this.topologicalSort(graph);
    
    // Execute in order
    for (const taskId of order) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;
      
      await this.executeTask(task, tasks, graph);
    }
    
    // Calculate stats
    const completed = Array.from(this.results.values()).filter(r => r.success && !r.degraded).length;
    const failed = Array.from(this.results.values()).filter(r => !r.success).length;
    const degraded = Array.from(this.results.values()).filter(r => r.degraded).length;
    const skipped = Array.from(this.results.values()).filter(r => r.success && r.warnings?.includes('SKIPPED')).length;
    
    return {
      totalTasks: tasks.length,
      completed,
      failed,
      degraded,
      skipped,
      cascadeEvents: this.cascadeEvents,
      executionOrder: this.executionOrder,
    };
  }
  
  /**
   * Build adjacency list from task dependencies
   */
  private buildGraph(tasks: Task[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    for (const task of tasks) {
      if (!graph.has(task.id)) {
        graph.set(task.id, new Set());
      }
      for (const dep of task.dependencies) {
        graph.get(task.id)!.add(dep);
      }
    }
    
    return graph;
  }
  
  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(graph: Map<string, Set<string>>): string[] {
    const inDegree = new Map<string, number>();
    const order: string[] = [];
    const queue: string[] = [];
    
    // Initialize in-degrees
    for (const [taskId, deps] of graph) {
      const degree = deps.size;
      inDegree.set(taskId, degree);
      if (degree === 0) {
        queue.push(taskId);
      }
    }
    
    // Process in order
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      
      // Reduce in-degree for dependent tasks
      for (const [taskId, deps] of graph) {
        if (deps.has(current)) {
          const newDegree = (inDegree.get(taskId) || 0) - 1;
          inDegree.set(taskId, newDegree);
          if (newDegree === 0) {
            queue.push(taskId);
          }
        }
      }
    }
    
    return order;
  }
  
  /**
   * Execute a single task with cascade mitigation
   */
  private async executeTask(
    task: Task,
    allTasks: Task[],
    graph: Map<string, Set<string>>
  ): Promise<void> {
    const policy = { ...DEFAULT_TASK_POLICY, ...task.policy };
    
    // Find failed dependencies
    const failedDependencies = this.findFailedDependencies(task, allTasks);
    
    // Get available inputs from completed tasks
    const availableInputs = this.getAvailableInputs(task, allTasks);
    
    if (failedDependencies.length > 0) {
      // Analyze cascade policy
      const decision = analyzeCascade(task.id, policy, failedDependencies, availableInputs, this.taskResults);
      
      // Log cascade event
      this.logCascadeEvent(task.id, failedDependencies, decision);
      
      if (!decision.shouldExecute) {
        // Mark as failed due to cascade
        this.results.set(task.id, {
          success: false,
          error: decision.reason,
          warnings: decision.warnings,
        });
        return;
      }
      
      // Execute in degraded mode
      try {
        const degradedContext = createDegradedContext(
          JSON.stringify(task.input),
          failedDependencies.map(d => d.taskId),
          availableInputs
        );
        
        const startTime = Date.now();
        const result = await task.execute({
          ...(task.input as Record<string, unknown> || {}),
          _degradedContext: degradedContext,
          _failedDependencies: failedDependencies.map(d => d.taskId),
        });
        
        this.results.set(task.id, {
          ...result,
          degraded: true,
          executionTimeMs: Date.now() - startTime,
          warnings: [...(result.warnings || []), ...decision.warnings],
        });
        this.taskResults.set(task.id, result.output);
        this.executionOrder.push(task.id);
        
      } catch (error) {
        this.results.set(task.id, {
          success: false,
          error: String(error),
          degraded: true,
        });
      }
      return;
    }
    
    // Normal execution
    try {
      const startTime = Date.now();
      const result = await task.execute(task.input as Record<string, unknown> || {});
      
      this.results.set(task.id, {
        ...result,
        executionTimeMs: Date.now() - startTime,
      });
      this.taskResults.set(task.id, result.output);
      this.executionOrder.push(task.id);
      
    } catch (error) {
      this.results.set(task.id, {
        success: false,
        error: String(error),
      });
    }
  }
  
  /**
   * Find dependencies that failed
   */
  private findFailedDependencies(task: Task, allTasks: Task[]): { taskId: string; isDirect: boolean; error?: string }[] {
    const failed: { taskId: string; isDirect: boolean; error?: string }[] = [];
    
    // Check direct dependencies
    for (const depId of task.dependencies) {
      const result = this.results.get(depId);
      if (result && !result.success) {
        failed.push({ taskId: depId, isDirect: true, error: result.error });
      }
    }
    
    // Check transitive dependencies if abort policy on indirect
    // (simplified - in real impl would traverse full graph)
    
    return failed;
  }
  
  /**
   * Get outputs from completed tasks as inputs
   */
  private getAvailableInputs(task: Task, allTasks: Task[]): Map<string, unknown> {
    const inputs = new Map<string, unknown>();
    
    for (const depId of task.dependencies) {
      const result = this.taskResults.get(depId);
      if (result !== undefined) {
        inputs.set(depId, result);
      }
    }
    
    return inputs;
  }
  
  /**
   * Log a cascade event
   */
  private logCascadeEvent(
    taskId: string,
    failedDeps: { taskId: string; isDirect: boolean; error?: string }[],
    decision: CascadeDecision
  ): void {
    const event: CascadeEvent = {
      timestamp: new Date(),
      taskId,
      failedDependencyId: failedDeps[0]?.taskId || 'unknown',
      policy: decision.policy,
      decision: decision.shouldExecute ? 'execute' : 'abort',
      reason: decision.reason,
    };
    
    this.cascadeEvents.push(event);
  }
  
  /**
   * Get results for all tasks
   */
  getResults(): Map<string, TaskResult> {
    return this.results;
  }
  
  /**
   * Get cascade events for analysis
   */
  getCascadeEvents(): CascadeEvent[] {
    return this.cascadeEvents;
  }
}

export default CascadeAwareExecutor;
