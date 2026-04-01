/**
 * Integration tests: DAGExecutor ↔ CascadeManager ↔ ContextSharingManager
 *
 * Tests that the DAG executor correctly wires cascade failure propagation
 * and cross-task context sharing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DAGExecutor, type ExecutionContext } from '../dag/executor.js';
import { CascadeManager } from '../cascade/manager.js';
import { ContextSharingManager } from '../context/sharing.js';
import type { Task, TaskResult, SwarmConfig } from '../types.js';

const BASE_CONFIG: SwarmConfig = {
  localConcurrency: 4,
  timeoutSeconds: 30,
  maxRetries: 2,
  enableMemory: false,
  dagMode: 'streaming',
  notifyOnComplete: 'none',
  routingStrategy: 'fast',
  useSixSignalRouting: false,
  omniRouteEnabled: false,
  stagnationEnabled: false,
};

function makeTask(id: string, dependsOn: string[] = []): Task {
  return { id, persona: 'test', task: `Do ${id}`, priority: 'medium', dependsOn };
}

type ExecutorFn = (task: Task, opts: any) => Promise<TaskResult>;

function buildContext(
  executorFn: ExecutorFn,
  cascade?: CascadeManager,
  context?: ContextSharingManager
): ExecutionContext {
  const executor = { execute: executorFn };
  return {
    config: BASE_CONFIG,
    getExecutor: () => executor as any,
    cascadeManager: cascade,
    contextManager: context,
  };
}

describe('DAGExecutor ↔ CascadeManager', () => {
  describe('abort_dependents policy', () => {
    it('skips downstream tasks when upstream fails', async () => {
      const callLog: string[] = [];
      const cascade = new CascadeManager({ defaultPolicy: 'abort_dependents', maxRetries: 0 });

      const tasks = [
        makeTask('root'),
        makeTask('child', ['root']),
        makeTask('grandchild', ['child']),
      ];

      const executorFn: ExecutorFn = async (task) => {
        callLog.push(task.id);
        if (task.id === 'root') {
          return { task, success: false, error: 'Root failed', durationMs: 10, retries: 0 };
        }
        return { task, success: true, output: 'ok', durationMs: 10, retries: 0 };
      };

      const ctx = buildContext(executorFn, cascade);
      const dag = new DAGExecutor(tasks, ctx);
      const results = await dag.execute('streaming');

      // Only root was actually executed
      expect(callLog).toEqual(['root']);

      // Child and grandchild were cascade-skipped
      const childResult = results.find(r => r.task.id === 'child');
      const grandchildResult = results.find(r => r.task.id === 'grandchild');
      expect(childResult?.success).toBe(false);
      expect(childResult?.error).toContain('cascade');
      expect(grandchildResult?.success).toBe(false);
      expect(grandchildResult?.error).toContain('cascade');
    });
  });

  describe('retry_then_skip policy', () => {
    it('retries failed task then skips dependents on exhaustion', async () => {
      let rootAttempts = 0;
      const cascade = new CascadeManager({
        defaultPolicy: 'retry_then_skip',
        maxRetries: 2,
        retryBackoffMs: 1,
        retryBackoffMultiplier: 1,
      });

      const tasks = [
        makeTask('flaky'),
        makeTask('dependent', ['flaky']),
      ];

      const executorFn: ExecutorFn = async (task) => {
        if (task.id === 'flaky') {
          rootAttempts++;
          return { task, success: false, error: `Attempt ${rootAttempts}`, durationMs: 5, retries: 0 };
        }
        return { task, success: true, output: 'ok', durationMs: 5, retries: 0 };
      };

      const ctx = buildContext(executorFn, cascade);
      const dag = new DAGExecutor(tasks, ctx);
      const results = await dag.execute('streaming');

      // 1 initial + 2 retries = 3 total attempts
      expect(rootAttempts).toBe(3);

      // Dependent was skipped after retries exhausted
      const depResult = results.find(r => r.task.id === 'dependent');
      expect(depResult?.success).toBe(false);
      expect(depResult?.error).toContain('cascade');
    });
  });

  describe('wave mode', () => {
    it('skips cascaded tasks in subsequent waves', async () => {
      const callLog: string[] = [];
      const cascade = new CascadeManager({ defaultPolicy: 'abort_dependents', maxRetries: 0 });

      const tasks = [
        makeTask('wave1-a'),
        makeTask('wave1-b'),
        makeTask('wave2-c', ['wave1-a']),
        makeTask('wave2-d', ['wave1-b']),
      ];

      const executorFn: ExecutorFn = async (task) => {
        callLog.push(task.id);
        if (task.id === 'wave1-a') {
          return { task, success: false, error: 'Failed', durationMs: 5, retries: 0 };
        }
        return { task, success: true, output: 'ok', durationMs: 5, retries: 0 };
      };

      const ctx = buildContext(executorFn, cascade);
      const dag = new DAGExecutor(tasks, ctx);
      const results = await dag.execute('waves');

      // wave1-a and wave1-b executed in wave 1; wave2-d in wave 2
      expect(callLog).toContain('wave1-a');
      expect(callLog).toContain('wave1-b');
      expect(callLog).toContain('wave2-d');
      // wave2-c was cascade-skipped (depends on failed wave1-a)
      expect(callLog).not.toContain('wave2-c');

      const cResult = results.find(r => r.task.id === 'wave2-c');
      expect(cResult?.success).toBe(false);
      expect(cResult?.error).toContain('cascade');
    });
  });
});

describe('DAGExecutor ↔ ContextSharingManager', () => {
  describe('output forwarding', () => {
    it('passes producer output to consumer via context', async () => {
      let consumerContext: Record<string, unknown> | undefined;
      const ctxManager = new ContextSharingManager();

      const tasks = [
        makeTask('producer'),
        makeTask('consumer', ['producer']),
      ];

      const executorFn: ExecutorFn = async (task, opts) => {
        if (task.id === 'consumer') {
          consumerContext = opts.context;
        }
        return {
          task,
          success: true,
          output: task.id === 'producer' ? 'produced-data-123' : 'consumed',
          durationMs: 5,
          retries: 0,
        };
      };

      const ctx = buildContext(executorFn, undefined, ctxManager);
      const dag = new DAGExecutor(tasks, ctx);
      await dag.execute('streaming');

      // Consumer received producer's output keyed by dep ID
      expect(consumerContext).toBeDefined();
      expect(consumerContext!['dep:producer:output']).toBe('produced-data-123');
    });
  });

  describe('multi-dependency context', () => {
    it('builds context from all upstream dependencies', async () => {
      let finalContext: Record<string, unknown> | undefined;
      const ctxManager = new ContextSharingManager();

      const tasks = [
        makeTask('dep1'),
        makeTask('dep2'),
        makeTask('aggregator', ['dep1', 'dep2']),
      ];

      const executorFn: ExecutorFn = async (task, opts) => {
        if (task.id === 'aggregator') {
          finalContext = opts.context;
        }
        return {
          task,
          success: true,
          output: `output-from-${task.id}`,
          durationMs: 5,
          retries: 0,
        };
      };

      const ctx = buildContext(executorFn, undefined, ctxManager);
      const dag = new DAGExecutor(tasks, ctx);
      await dag.execute('streaming');

      expect(finalContext).toBeDefined();
      expect(finalContext!['dep:dep1:output']).toBe('output-from-dep1');
      expect(finalContext!['dep:dep2:output']).toBe('output-from-dep2');
    });
  });

  describe('cascade + context combined', () => {
    it('successful branch gets context while failed branch cascades', async () => {
      const callLog: string[] = [];
      let successConsumerCtx: Record<string, unknown> | undefined;
      const cascade = new CascadeManager({ defaultPolicy: 'abort_dependents', maxRetries: 0 });
      const ctxManager = new ContextSharingManager();

      const tasks = [
        makeTask('good-root'),
        makeTask('bad-root'),
        makeTask('good-child', ['good-root']),
        makeTask('bad-child', ['bad-root']),
      ];

      const executorFn: ExecutorFn = async (task, opts) => {
        callLog.push(task.id);
        if (task.id === 'good-child') {
          successConsumerCtx = opts.context;
        }
        if (task.id === 'bad-root') {
          return { task, success: false, error: 'Failed', durationMs: 5, retries: 0 };
        }
        return { task, success: true, output: `data-${task.id}`, durationMs: 5, retries: 0 };
      };

      const ctx = buildContext(executorFn, cascade, ctxManager);
      const dag = new DAGExecutor(tasks, ctx);
      const results = await dag.execute('streaming');

      // good-child executed with context from good-root
      expect(callLog).toContain('good-child');
      expect(successConsumerCtx?.['dep:good-root:output']).toBe('data-good-root');

      // bad-child was cascade-skipped
      expect(callLog).not.toContain('bad-child');
      const badChild = results.find(r => r.task.id === 'bad-child');
      expect(badChild?.success).toBe(false);
      expect(badChild?.error).toContain('cascade');
    });
  });
});
