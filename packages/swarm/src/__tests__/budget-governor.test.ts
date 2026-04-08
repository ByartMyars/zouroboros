import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BudgetGovernor } from '../budget/governor.js';
import { closeDb } from '../db/schema.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = '/tmp/swarm-test-budget.db';

let gov: BudgetGovernor;

beforeEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  gov = new BudgetGovernor(TEST_DB);
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('Budget Governor', () => {
  test('initializes swarm budget', () => {
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 10.0 });
    const state = gov.getState('s1');
    expect(state.totalBudgetUSD).toBe(10.0);
    expect(state.totalSpentUSD).toBe(0);
    expect(state.remaining).toBe(10.0);
    expect(state.hardCapAction).toBe('downgrade');
  });

  test('records usage and updates state', () => {
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 10.0 });
    gov.recordUsage('s1', 'claude-code', 'opus', 1000, 500);
    const state = gov.getState('s1');
    expect(state.totalSpentUSD).toBeGreaterThan(0);
    expect(state.perExecutor['claude-code']).toBeGreaterThan(0);
    expect(state.remaining).toBeLessThan(10.0);
  });

  test('accumulates usage across calls', () => {
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 100.0 });
    gov.recordUsage('s1', 'claude-code', 'opus', 1000000, 500000);
    const state1 = gov.getState('s1');
    gov.recordUsage('s1', 'claude-code', 'opus', 1000000, 500000);
    const state2 = gov.getState('s1');
    expect(state2.totalSpentUSD).toBeGreaterThan(state1.totalSpentUSD);
  });

  test('tracks per-executor costs separately', () => {
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 100.0 });
    gov.recordUsage('s1', 'claude-code', 'opus', 100000, 50000);
    gov.recordUsage('s1', 'gemini', 'flash', 100000, 50000);
    const state = gov.getState('s1');
    expect(Object.keys(state.perExecutor)).toContain('claude-code');
    expect(Object.keys(state.perExecutor)).toContain('gemini');
    expect(state.perExecutor['claude-code']).toBeGreaterThan(state.perExecutor['gemini']);
  });

  test('fires alert at threshold', () => {
    const events: string[] = [];
    gov.on((e) => events.push(e.type));
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 1.0, alertThresholdPct: 50 });
    gov.recordUsage('s1', 'claude-code', 'opus', 500000, 100000);
    expect(events).toContain('budget:update');
  });

  test('detects cap reached', () => {
    gov.initSwarm({ swarmId: 's1', totalBudgetUSD: 0.001 });
    gov.recordUsage('s1', 'claude-code', 'opus', 1000000, 500000);
    const state = gov.getState('s1');
    expect(state.capReached).toBe(true);
  });

  test('checks per-executor limits', () => {
    gov.initSwarm({
      swarmId: 's1',
      totalBudgetUSD: 100.0,
      perExecutorLimits: { 'claude-code': 0.001 },
    });
    expect(gov.checkExecutorLimit('s1', 'claude-code')).toBe(true);
    gov.recordUsage('s1', 'claude-code', 'opus', 1000000, 500000);
    expect(gov.checkExecutorLimit('s1', 'claude-code')).toBe(false);
  });

  test('getDowngradeTarget returns cheap option', () => {
    const target = gov.getDowngradeTarget('claude-code');
    expect(target.executorId).toBe('gemini');
    expect(target.model).toBe('haiku');

    const hermesTarget = gov.getDowngradeTarget('hermes');
    expect(hermesTarget.executorId).toBe('hermes');
    expect(hermesTarget.model).toBe('byok');
  });

  test('handles missing swarm gracefully', () => {
    const state = gov.getState('nonexistent');
    expect(state.totalSpentUSD).toBe(0);
    expect(state.totalBudgetUSD).toBe(0);
  });
});
