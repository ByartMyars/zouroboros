import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  getProfile,
  updateTraits,
  updatePreferences,
  recordInteraction,
  getRecentInteractions,
  getProfileSummary,
  listProfiles,
  deleteProfile,
  ensureProfileSchema,
} from '../profiles.js';
import { initDatabase, closeDatabase } from '../database.js';
import type { MemoryConfig } from 'zouroboros-core';

const TEST_CONFIG: MemoryConfig = {
  enabled: true,
  dbPath: ':memory:',
  vectorEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  autoCapture: false,
  captureIntervalMinutes: 30,
  graphBoost: false,
  hydeExpansion: false,
  decayConfig: { permanent: 99999, long: 365, medium: 90, short: 30 },
};

beforeEach(() => {
  initDatabase(TEST_CONFIG);
  ensureProfileSchema();
});

afterEach(() => {
  closeDatabase();
});

describe('getProfile', () => {
  test('auto-creates profile on first access', () => {
    const profile = getProfile('test-entity');
    expect(profile.entity).toBe('test-entity');
    expect(profile.traits).toEqual({});
    expect(profile.preferences).toEqual({});
    expect(profile.interactionHistory).toEqual([]);
  });

  test('returns existing profile', () => {
    getProfile('entity-a');
    updateTraits('entity-a', { speed: 0.8 });
    const profile = getProfile('entity-a');
    expect(profile.traits.speed).toBe(0.8);
  });
});

describe('updateTraits', () => {
  test('merges new traits with existing', () => {
    updateTraits('bot', { accuracy: 0.9 });
    updateTraits('bot', { speed: 0.7 });
    const profile = getProfile('bot');
    expect(profile.traits).toEqual({ accuracy: 0.9, speed: 0.7 });
  });

  test('overwrites existing trait values', () => {
    updateTraits('bot', { accuracy: 0.5 });
    updateTraits('bot', { accuracy: 0.9 });
    expect(getProfile('bot').traits.accuracy).toBe(0.9);
  });
});

describe('updatePreferences', () => {
  test('merges new preferences', () => {
    updatePreferences('user', { theme: 'dark' });
    updatePreferences('user', { lang: 'en' });
    expect(getProfile('user').preferences).toEqual({ theme: 'dark', lang: 'en' });
  });
});

describe('recordInteraction', () => {
  test('tracks interactions', () => {
    recordInteraction('api', 'query', true, 42);
    recordInteraction('api', 'store', false, 150);

    const interactions = getRecentInteractions('api');
    expect(interactions.length).toBe(2);
    expect(interactions[0].type).toBe('store'); // most recent first
    expect(interactions[0].success).toBe(false);
    expect(interactions[1].type).toBe('query');
    expect(interactions[1].latencyMs).toBe(42);
  });

  test('increments interaction count', () => {
    recordInteraction('svc', 'search', true, 10);
    recordInteraction('svc', 'search', true, 15);
    const summary = getProfileSummary('svc');
    expect(summary.totalInteractions).toBe(2);
  });
});

describe('getProfileSummary', () => {
  test('computes success rate and avg latency', () => {
    recordInteraction('calc', 'query', true, 10);
    recordInteraction('calc', 'query', true, 20);
    recordInteraction('calc', 'query', false, 100);

    const summary = getProfileSummary('calc');
    expect(summary.successRate).toBeCloseTo(2 / 3, 2);
    expect(summary.avgLatencyMs).toBeCloseTo((10 + 20 + 100) / 3, 1);
    expect(summary.totalInteractions).toBe(3);
  });

  test('returns zero for entity with no interactions', () => {
    getProfile('empty');
    const summary = getProfileSummary('empty');
    expect(summary.totalInteractions).toBe(0);
    expect(summary.successRate).toBe(0);
  });
});

describe('listProfiles', () => {
  test('lists all entities', () => {
    getProfile('alpha');
    getProfile('beta');
    getProfile('gamma');
    const list = listProfiles();
    expect(list.length).toBe(3);
    expect(list).toContain('alpha');
    expect(list).toContain('beta');
  });
});

describe('deleteProfile', () => {
  test('removes profile and interactions', () => {
    recordInteraction('temp', 'query', true, 5);
    expect(deleteProfile('temp')).toBe(true);
    expect(listProfiles()).not.toContain('temp');
    expect(getRecentInteractions('temp')).toEqual([]);
  });

  test('returns false for non-existent profile', () => {
    expect(deleteProfile('nonexistent')).toBe(false);
  });
});
