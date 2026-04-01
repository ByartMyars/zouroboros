import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { PersonaAnalytics } from '../analytics';

const TEST_DIR = join(import.meta.dir, '../../.test-analytics');

describe('PersonaAnalytics', () => {
  let analytics: PersonaAnalytics;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    analytics = new PersonaAnalytics(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('session tracking', () => {
    test('records session start', () => {
      analytics.startSession('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics).not.toBeNull();
      expect(metrics!.totalSessions).toBe(1);
    });

    test('tracks session duration', () => {
      analytics.startSession('analyst');
      // Simulate time passing
      const raw = analytics as any;
      const startTime = new Date(Date.now() - 5000).toISOString();
      raw.activeSessions.set('analyst', startTime);
      analytics.endSession('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.totalDuration).toBeGreaterThan(4000);
    });

    test('tracks multiple sessions', () => {
      analytics.startSession('analyst');
      analytics.endSession('analyst');
      analytics.startSession('analyst');
      analytics.endSession('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.totalSessions).toBe(2);
    });
  });

  describe('task tracking', () => {
    test('records task completion', () => {
      analytics.startSession('analyst');
      analytics.recordTaskComplete('analyst', { domain: 'finance' });
      analytics.recordTaskComplete('analyst', { domain: 'finance' });
      analytics.recordTaskComplete('analyst', { domain: 'research' });
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.taskCompletionRate).toBe(1.0);
      expect(metrics!.domainBreakdown['finance']).toBe(2);
      expect(metrics!.domainBreakdown['research']).toBe(1);
    });

    test('records task failures', () => {
      analytics.startSession('analyst');
      analytics.recordTaskComplete('analyst');
      analytics.recordTaskFail('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.taskCompletionRate).toBe(0.5);
    });

    test('completion rate is 0 when no tasks', () => {
      analytics.startSession('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.taskCompletionRate).toBe(0);
    });
  });

  describe('tool tracking', () => {
    test('records tool usage', () => {
      analytics.startSession('analyst');
      analytics.recordToolCall('analyst', 'web_search');
      analytics.recordToolCall('analyst', 'web_search');
      analytics.recordToolCall('analyst', 'read_file');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.toolUsage['web_search']).toBe(2);
      expect(metrics!.toolUsage['read_file']).toBe(1);
    });
  });

  describe('error tracking', () => {
    test('records errors', () => {
      analytics.startSession('analyst');
      analytics.recordError('analyst', 'API timeout');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.errorRate).toBe(1.0);
    });
  });

  describe('switch tracking', () => {
    test('records switch-away events', () => {
      analytics.startSession('analyst');
      analytics.recordSwitchAway('analyst');
      analytics.flush();

      const metrics = analytics.getMetrics('analyst');
      expect(metrics!.switchAwayRate).toBe(1.0);
    });
  });

  describe('getAllMetrics', () => {
    test('returns metrics for all tracked personas', () => {
      analytics.startSession('analyst');
      analytics.startSession('advisor');
      analytics.startSession('researcher');
      analytics.flush();

      const all = analytics.getAllMetrics();
      expect(all.length).toBe(3);
    });
  });

  describe('getTopPersonas', () => {
    test('returns top personas by session count', () => {
      analytics.startSession('low');
      analytics.startSession('high');
      analytics.startSession('high');
      analytics.startSession('high');
      analytics.startSession('medium');
      analytics.startSession('medium');
      analytics.flush();

      const top = analytics.getTopPersonas(2);
      expect(top.length).toBe(2);
      expect(top[0].slug).toBe('high');
      expect(top[1].slug).toBe('medium');
    });
  });

  describe('getEffectivenessReport', () => {
    test('generates effectiveness report', () => {
      analytics.startSession('analyst');
      analytics.recordTaskComplete('analyst');
      analytics.recordTaskComplete('analyst');
      analytics.recordTaskFail('analyst');
      analytics.flush();

      const report = analytics.getEffectivenessReport();
      expect(report['analyst']).toBeDefined();
      expect(report['analyst'].completionRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('getRecentEvents', () => {
    test('returns recent events', () => {
      analytics.startSession('analyst');
      analytics.recordTaskComplete('analyst');
      analytics.endSession('analyst');
      analytics.flush();

      const events = analytics.getRecentEvents();
      expect(events.length).toBe(3);
      expect(events[0].type).toBe('session_start');
    });
  });

  describe('getEventsForPersona', () => {
    test('filters events by persona', () => {
      analytics.startSession('analyst');
      analytics.startSession('advisor');
      analytics.recordTaskComplete('analyst');
      analytics.flush();

      const events = analytics.getEventsForPersona('analyst');
      expect(events.length).toBe(2);
      expect(events.every(e => e.persona === 'analyst')).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    test('resets metrics for a specific persona', () => {
      analytics.startSession('analyst');
      analytics.startSession('advisor');
      analytics.flush();

      analytics.resetMetrics('analyst');
      expect(analytics.getMetrics('analyst')).toBeNull();
      expect(analytics.getMetrics('advisor')).not.toBeNull();
    });

    test('resets all metrics', () => {
      analytics.startSession('analyst');
      analytics.startSession('advisor');
      analytics.flush();

      analytics.resetMetrics();
      expect(analytics.getAllMetrics().length).toBe(0);
    });
  });

  describe('persistence', () => {
    test('persists data across instances', () => {
      analytics.startSession('analyst');
      analytics.recordTaskComplete('analyst');
      analytics.flush();

      const analytics2 = new PersonaAnalytics(TEST_DIR);
      const metrics = analytics2.getMetrics('analyst');
      expect(metrics).not.toBeNull();
      expect(metrics!.totalSessions).toBe(1);
    });

    test('creates data file', () => {
      analytics.startSession('test');
      analytics.flush();
      expect(existsSync(join(TEST_DIR, 'persona-analytics.json'))).toBe(true);
    });
  });

  describe('auto-flush', () => {
    test('flushes after 50 buffered events', () => {
      for (let i = 0; i < 55; i++) {
        analytics.recordToolCall('analyst', `tool-${i}`);
      }
      // Should have auto-flushed at 50
      const metrics = analytics.getMetrics('analyst');
      expect(metrics).not.toBeNull();
    });
  });

  describe('null safety', () => {
    test('returns null for unknown persona', () => {
      expect(analytics.getMetrics('nonexistent')).toBeNull();
    });
  });
});
