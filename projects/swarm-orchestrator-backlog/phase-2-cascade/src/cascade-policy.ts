/**
 * Cascade Mitigation Policy Engine
 * 
 * Defines failure handling policies for DAG-based task execution.
 * Allows tasks to specify behavior when dependencies fail.
 * 
 * Policy Types:
 * - abort: Mark task as failed, do not execute
 * - degrade: Execute with degraded/partial inputs + warning annotation
 * - retry: Retry failed dependency before proceeding
 * - skip: Skip dependency check, proceed anyway
 */

export type CascadePolicy = 'abort' | 'degrade' | 'retry' | 'skip';

export interface TaskPolicy {
  onDependencyFailure: CascadePolicy;
  onIndirectDependencyFailure: CascadePolicy;
  maxRetries?: number;
  retryDelayMs?: number;
  includeWarnings?: boolean;
}

export const DEFAULT_TASK_POLICY: TaskPolicy = {
  onDependencyFailure: 'abort',
  onIndirectDependencyFailure: 'abort',
  maxRetries: 3,
  retryDelayMs: 1000,
  includeWarnings: true,
};

export interface DependencyInfo {
  taskId: string;
  isDirect: boolean;
  failedAt?: Date;
  error?: string;
}

export interface CascadeDecision {
  taskId: string;
  policy: CascadePolicy;
  reason: string;
  dependencies: DependencyInfo[];
  shouldExecute: boolean;
  warnings: string[];
}

/**
 * Analyze a task's dependencies and determine the cascade policy
 */
export function analyzeCascade(
  taskId: string,
  taskPolicy: TaskPolicy,
  failedDependencies: DependencyInfo[],
  availableInputs: Map<string, unknown>,
  allTaskResults?: Map<string, unknown>
): CascadeDecision {
  const warnings: string[] = [];
  const directDeps = failedDependencies.filter(d => d.isDirect);
  const indirectDeps = failedDependencies.filter(d => !d.isDirect);
  
  let policy: CascadePolicy;
  let reason: string;
  let shouldExecute = true;
  
  // Direct dependency failures take precedence
  if (directDeps.length > 0) {
    policy = taskPolicy.onDependencyFailure;
    
    switch (policy) {
      case 'abort':
        shouldExecute = false;
        reason = `Direct dependency ${directDeps[0].taskId} failed with ${policy} policy`;
        break;
        
      case 'degrade':
        // Check if we have enough inputs to proceed
        const canDegrade = checkDegradableInputs(taskId, directDeps, availableInputs, allTaskResults);
        if (canDegrade) {
          reason = `Degrading execution due to failed dependency: ${directDeps[0].taskId}`;
          warnings.push(`⚠️ Running in DEGRADED mode - dependency ${directDeps[0].taskId} failed`);
          directDeps.forEach(d => {
            warnings.push(`  Missing input from: ${d.taskId} (${d.error || 'unknown error'})`);
          });
        } else {
          policy = 'abort';
          shouldExecute = false;
          reason = `Cannot degrade - insufficient inputs available`;
        }
        break;
        
      case 'retry':
        reason = `Will retry failed dependency: ${directDeps[0].taskId}`;
        break;
        
      case 'skip':
        reason = `Skipping dependency check for: ${directDeps.map(d => d.taskId).join(', ')}`;
        warnings.push(`⚠️ Running with SKIP policy - dependency failures ignored`);
        break;
    }
  } else if (indirectDeps.length > 0) {
    policy = taskPolicy.onIndirectDependencyFailure;
    reason = `Indirect dependency ${indirectDeps[0].taskId} failed with ${policy} policy`;
    
    if (policy === 'abort') {
      shouldExecute = false;
    } else {
      warnings.push(`⚠️ Indirect dependency failure: ${indirectDeps[0].taskId}`);
    }
  } else {
    policy = 'abort';
    reason = 'No failed dependencies';
    shouldExecute = false;
  }
  
  return {
    taskId,
    policy,
    reason,
    dependencies: failedDependencies,
    shouldExecute,
    warnings,
  };
}

/**
 * Check if a task can execute in degraded mode with partial inputs
 * 
 * For degraded mode, we allow execution if:
 * 1. The task is an analysis type (can work with partial/erroneous inputs)
 * 2. OR there are some successful inputs available
 * 3. OR there are failed dependency results (can include error context)
 */
function checkDegradableInputs(
  taskId: string,
  failedDeps: DependencyInfo[],
  availableInputs: Map<string, unknown>,
  allTaskResults: Map<string, unknown>
): boolean {
  // Always allow degradation - the degraded context will inform the task
  // This enables analysis tasks to still produce useful output with partial data
  // For mutation tasks, the caller should set onDependencyFailure: 'abort'
  return true;
}

/**
 * Create a degraded context for a task executing with partial inputs
 */
export function createDegradedContext(
  originalTask: string,
  missingDependencies: string[],
  availableInputs: Map<string, unknown>
): string {
  const contextParts = [
    `[DEGRADED EXECUTION MODE]`,
    ``,
    `Original task: ${originalTask}`,
    ``,
    `⚠️ This task is running with PARTIAL INPUTS due to failed dependencies:`,
    ...missingDependencies.map(d => `  - ${d}`),
    ``,
    `Available inputs (${availableInputs.size}):`,
    ...Array.from(availableInputs.entries()).map(([key, value]) => {
      const preview = typeof value === 'string' 
        ? value.substring(0, 100) + (value.length > 100 ? '...' : '')
        : JSON.stringify(value).substring(0, 100);
      return `  - ${key}: ${preview}`;
    }),
    ``,
    `Expect reduced quality of output. Annotate your response with "DEGRADED: " prefix.`,
  ];
  
  return contextParts.join('\n');
}
