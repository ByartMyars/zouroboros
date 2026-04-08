import { describe, test, expect } from 'bun:test';
import { selectExecutor } from '../selector/executor-selector.js';
import type { Task, ExecutorRegistryEntry } from '../types.js';
import type { BudgetSnapshot, HealthSnapshot } from '../selector/executor-selector.js';

const EXECUTORS: ExecutorRegistryEntry[] = [
  { id: 'claude-code', name: 'Claude Code', executor: 'local', description: '', expertise: [], bestFor: [], config: { defaultTimeout: 600 } },
  { id: 'gemini', name: 'Gemini CLI', executor: 'local', description: '', expertise: [], bestFor: [], config: { defaultTimeout: 300 } },
  { id: 'codex', name: 'Codex CLI', executor: 'local', description: '', expertise: [], bestFor: [], config: { defaultTimeout: 600 } },
  { id: 'hermes', name: 'Hermes Agent', executor: 'local', description: '', expertise: [], bestFor: [], config: { defaultTimeout: 300 } },
];

const HEALTHY: HealthSnapshot = {
  'claude-code': { state: 'CLOSED', failures: 0 },
  'gemini': { state: 'CLOSED', failures: 0 },
  'codex': { state: 'CLOSED', failures: 0 },
  'hermes': { state: 'CLOSED', failures: 0 },
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    persona: 'test',
    task: 'Do something',
    priority: 'medium',
    ...overrides,
  };
}

describe('Executor Selector', () => {
  test('respects explicit executorId', () => {
    const result = selectExecutor(
      makeTask({ executor: 'codex' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBe('codex');
    expect(result.confidence).toBe(1.0);
  });

  test('routes reasoning tasks to claude-code', () => {
    const result = selectExecutor(
      makeTask({ task: 'Design the architecture and planning for the new system' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBe('claude-code');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('routes UI tasks to gemini', () => {
    const result = selectExecutor(
      makeTask({ task: 'Build the frontend UI component with visual design' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBe('gemini');
  });

  test('routes backend tasks to codex', () => {
    const result = selectExecutor(
      makeTask({ task: 'Refactor the backend API database endpoint' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBe('codex');
  });

  test('routes research tasks to hermes', () => {
    const result = selectExecutor(
      makeTask({ task: 'Research web competitors and investigation analysis' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBe('hermes');
  });

  test('downgrades to cheapest when budget < 20%', () => {
    const budget: BudgetSnapshot = {
      totalSpentUSD: 9.0,
      totalBudgetUSD: 10.0,
      perExecutor: { 'claude-code': 9.0 },
    };
    const result = selectExecutor(
      makeTask({ task: 'Complex architecture planning' }),
      budget, HEALTHY, EXECUTORS
    );
    expect(['hermes', 'gemini']).toContain(result.executorId);
    expect(result.reasoning).toContain('downgrading');
  });

  test('falls back when primary circuit breaker is open', () => {
    const unhealthy: HealthSnapshot = {
      ...HEALTHY,
      'claude-code': { state: 'OPEN', failures: 5 },
    };
    const result = selectExecutor(
      makeTask({ task: 'Architecture planning and reasoning' }),
      null, unhealthy, EXECUTORS
    );
    expect(result.executorId).not.toBe('claude-code');
    expect(result.reasoning).toContain('circuit breaker OPEN');
  });

  test('uses role resolution when provided', () => {
    const result = selectExecutor(
      makeTask(),
      null, HEALTHY, EXECUTORS,
      { executorId: 'gemini', model: 'pro' }
    );
    expect(result.executorId).toBe('gemini');
    expect(result.model).toBe('pro');
    expect(result.confidence).toBe(0.9);
  });

  test('returns fallbacks array', () => {
    const result = selectExecutor(
      makeTask({ executor: 'claude-code' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.fallbacks.length).toBeGreaterThan(0);
    expect(result.fallbacks).not.toContain('claude-code');
  });

  test('auto mode triggers tag matching', () => {
    const result = selectExecutor(
      makeTask({ executor: 'auto', task: 'Deploy infrastructure and monitoring' }),
      null, HEALTHY, EXECUTORS
    );
    expect(result.executorId).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});
