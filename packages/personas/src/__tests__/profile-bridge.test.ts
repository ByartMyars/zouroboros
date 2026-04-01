/**
 * Tests: ProfileBridge — persona analytics ↔ memory profile integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PersonaAnalytics } from '../analytics.js';
import { ProfileBridge, createProfileBridge, type ProfileAccessor } from '../profile-bridge.js';

/** In-memory mock of ProfileAccessor (dependency injection) */
class MockProfileAccessor implements ProfileAccessor {
  traits: Map<string, Record<string, number>> = new Map();
  preferences: Map<string, Record<string, string>> = new Map();
  interactions: Array<{ entity: string; type: string; success: boolean; latencyMs: number }> = [];

  updateTraits(entity: string, traits: Record<string, number>): void {
    const existing = this.traits.get(entity) || {};
    this.traits.set(entity, { ...existing, ...traits });
  }

  updatePreferences(entity: string, preferences: Record<string, string>): void {
    const existing = this.preferences.get(entity) || {};
    this.preferences.set(entity, { ...existing, ...preferences });
  }

  recordInteraction(entity: string, type: 'query' | 'store' | 'search', success: boolean, latencyMs: number): void {
    this.interactions.push({ entity, type, success, latencyMs });
  }

  getProfileSummary(entity: string) {
    const traits = this.traits.get(entity);
    const prefs = this.preferences.get(entity);
    if (!traits && !prefs) return null;
    return {
      entity,
      totalInteractions: this.interactions.filter(i => i.entity === entity).length,
      successRate: 0.95,
      avgLatencyMs: 42,
      traitCount: traits ? Object.keys(traits).length : 0,
      preferenceCount: prefs ? Object.keys(prefs).length : 0,
    };
  }
}

describe('ProfileBridge', () => {
  let tmpDir: string;
  let analytics: PersonaAnalytics;
  let profiles: MockProfileAccessor;
  let bridge: ProfileBridge;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `zouroboros-bridge-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    analytics = new PersonaAnalytics(tmpDir);
    profiles = new MockProfileAccessor();
    bridge = new ProfileBridge(analytics, profiles);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedPersona(slug: string, opts?: { tasks?: number; fails?: number; tools?: Record<string, number>; domains?: Record<string, number> }) {
    analytics.startSession(slug);
    for (let i = 0; i < (opts?.tasks || 2); i++) {
      analytics.recordTaskComplete(slug, opts?.domains ? { domain: Object.keys(opts.domains)[i % Object.keys(opts.domains).length] } : undefined);
    }
    for (let i = 0; i < (opts?.fails || 0); i++) {
      analytics.recordTaskFail(slug);
    }
    for (const [tool, count] of Object.entries(opts?.tools || {})) {
      for (let i = 0; i < count; i++) {
        analytics.recordToolCall(slug, tool);
      }
    }
    analytics.endSession(slug);
  }

  describe('sync()', () => {
    it('pushes traits for all personas through ProfileAccessor', () => {
      seedPersona('alaric', { tasks: 5, tools: { read_file: 3, run_bash_command: 2 } });
      seedPersona('hermes', { tasks: 3, tools: { web_search: 4 } });

      const count = bridge.sync();
      expect(count).toBe(2);

      const alaricTraits = profiles.traits.get('persona:alaric');
      expect(alaricTraits).toBeDefined();
      expect(alaricTraits!.total_sessions).toBe(1);
      expect(alaricTraits!.task_completion_rate).toBe(1); // 5/5

      const hermesTraits = profiles.traits.get('persona:hermes');
      expect(hermesTraits).toBeDefined();
      expect(hermesTraits!.total_sessions).toBe(1);
    });

    it('stores top 5 tools as preferences', () => {
      seedPersona('coder', {
        tasks: 1,
        tools: { read_file: 10, run_bash: 8, grep: 6, edit_file: 4, write: 2, rare_tool: 1 },
      });

      bridge.sync();
      const prefs = profiles.preferences.get('persona:coder')!;

      // Top 5 tools only (rare_tool excluded)
      expect(prefs['preferred_tool_read_file']).toBe('10');
      expect(prefs['preferred_tool_run_bash']).toBe('8');
      expect(prefs['preferred_tool_grep']).toBe('6');
      expect(prefs['preferred_tool_edit_file']).toBe('4');
      expect(prefs['preferred_tool_write']).toBe('2');
      expect(prefs['preferred_tool_rare_tool']).toBeUndefined();
    });

    it('stores domain breakdown as preferences', () => {
      seedPersona('analyst', {
        tasks: 3,
        domains: { finance: 2, engineering: 1 },
      });

      bridge.sync();
      const prefs = profiles.preferences.get('persona:analyst')!;
      expect(prefs['domain_finance']).toBeDefined();
      expect(prefs['domain_engineering']).toBeDefined();
    });

    it('returns 0 when no personas exist', () => {
      const count = bridge.sync();
      expect(count).toBe(0);
      expect(profiles.traits.size).toBe(0);
    });
  });

  describe('syncPersona()', () => {
    it('syncs a single persona', () => {
      seedPersona('alaric', { tasks: 3 });
      seedPersona('hermes', { tasks: 2 });

      const result = bridge.syncPersona('alaric');
      expect(result).toBe(true);

      // Only alaric was synced
      expect(profiles.traits.has('persona:alaric')).toBe(true);
      expect(profiles.traits.has('persona:hermes')).toBe(false);
    });

    it('returns false for unknown persona', () => {
      expect(bridge.syncPersona('nonexistent')).toBe(false);
    });
  });

  describe('getCombinedReport()', () => {
    it('merges analytics and profile data', () => {
      seedPersona('alaric', { tasks: 5, fails: 1 });
      bridge.sync(); // Populate profile data

      const report = bridge.getCombinedReport('alaric');
      expect(report).not.toBeNull();
      expect(report!.analytics.slug).toBe('alaric');
      expect(report!.analytics.totalSessions).toBe(1);
      expect(report!.profile).not.toBeNull();
      expect(report!.profile!.totalInteractions).toBe(0); // no recordInteraction calls
      expect(report!.profile!.successRate).toBe(0.95);
    });

    it('returns null for unknown persona', () => {
      expect(bridge.getCombinedReport('ghost')).toBeNull();
    });

    it('returns null profile when not yet synced', () => {
      seedPersona('fresh');
      const report = bridge.getCombinedReport('fresh');
      expect(report).not.toBeNull();
      expect(report!.analytics.slug).toBe('fresh');
      expect(report!.profile).toBeNull(); // Not synced yet
    });
  });

  describe('trait mapping', () => {
    it('default mapper converts ms to seconds for avg_session_duration', () => {
      seedPersona('tester', { tasks: 2 });
      bridge.sync();

      const traits = profiles.traits.get('persona:tester')!;
      // avgSessionDuration is in ms, trait should be in seconds
      expect(traits.avg_session_duration_s).toBeDefined();
      expect(traits.avg_session_duration_s).toBeGreaterThanOrEqual(0);
    });

    it('custom trait mapper overrides defaults', () => {
      const customBridge = createProfileBridge(analytics, profiles, {
        traitMapper: (metrics) => ({
          custom_score: metrics.totalSessions * 100,
        }),
      });

      seedPersona('custom');
      customBridge.sync();

      const traits = profiles.traits.get('persona:custom')!;
      expect(traits.custom_score).toBe(100);
      expect(traits.task_completion_rate).toBeUndefined(); // default mapper not used
    });
  });

  describe('graceful handling of edge cases', () => {
    it('handles persona with no tasks', () => {
      analytics.startSession('idle');
      analytics.endSession('idle');

      bridge.sync();
      const traits = profiles.traits.get('persona:idle')!;
      expect(traits.task_completion_rate).toBe(0);
      expect(traits.error_rate).toBe(0);
    });

    it('handles persona with no tools', () => {
      seedPersona('notool', { tasks: 1, tools: {} });
      bridge.sync();

      // No tool preferences stored
      const prefs = profiles.preferences.get('persona:notool');
      // May have domain prefs but no tool prefs
      const toolKeys = prefs ? Object.keys(prefs).filter(k => k.startsWith('preferred_tool_')) : [];
      expect(toolKeys).toHaveLength(0);
    });
  });
});
