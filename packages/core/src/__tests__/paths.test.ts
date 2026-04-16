import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import {
  getMemoryDbPath,
  getCheckpointDir,
  getWorkspaceRoot,
  getDataDir,
  expandHome,
} from '../paths.js';
import { DEFAULT_MEMORY_DB_PATH, DEFAULT_DATA_DIR } from '../constants.js';

/**
 * Snapshot and restore env vars touched by each suite so tests are
 * independent regardless of the host environment.
 */
const ENV_KEYS = [
  'ZOUROBOROS_MEMORY_DB',
  'ZO_MEMORY_DB',
  'ZOUROBOROS_CHECKPOINT_DIR',
  'ZO_CHECKPOINT_DIR',
  'ZOUROBOROS_WORKSPACE',
  'ZO_WORKSPACE',
  'ZOUROBOROS_DATA_DIR',
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
});

describe('getMemoryDbPath', () => {
  test('falls back to DEFAULT_MEMORY_DB_PATH when no env var set', () => {
    expect(getMemoryDbPath()).toBe(DEFAULT_MEMORY_DB_PATH);
  });

  test('honors legacy ZO_MEMORY_DB', () => {
    process.env.ZO_MEMORY_DB = '/custom/legacy.db';
    expect(getMemoryDbPath()).toBe('/custom/legacy.db');
  });

  test('honors canonical ZOUROBOROS_MEMORY_DB', () => {
    process.env.ZOUROBOROS_MEMORY_DB = '/custom/canonical.db';
    expect(getMemoryDbPath()).toBe('/custom/canonical.db');
  });

  test('ZOUROBOROS_MEMORY_DB takes precedence over ZO_MEMORY_DB', () => {
    process.env.ZO_MEMORY_DB = '/legacy.db';
    process.env.ZOUROBOROS_MEMORY_DB = '/canonical.db';
    expect(getMemoryDbPath()).toBe('/canonical.db');
  });
});

describe('getCheckpointDir', () => {
  test('falls back to DEFAULT_DATA_DIR/checkpoints', () => {
    expect(getCheckpointDir()).toBe(join(DEFAULT_DATA_DIR, 'checkpoints'));
  });

  test('honors legacy ZO_CHECKPOINT_DIR', () => {
    process.env.ZO_CHECKPOINT_DIR = '/legacy/ckpt';
    expect(getCheckpointDir()).toBe('/legacy/ckpt');
  });

  test('ZOUROBOROS_CHECKPOINT_DIR takes precedence', () => {
    process.env.ZO_CHECKPOINT_DIR = '/legacy/ckpt';
    process.env.ZOUROBOROS_CHECKPOINT_DIR = '/new/ckpt';
    expect(getCheckpointDir()).toBe('/new/ckpt');
  });
});

describe('getWorkspaceRoot', () => {
  test('falls back to cwd when no env var set', () => {
    expect(getWorkspaceRoot()).toBe(process.cwd());
  });

  test('honors legacy ZO_WORKSPACE', () => {
    process.env.ZO_WORKSPACE = '/my/ws';
    expect(getWorkspaceRoot()).toBe('/my/ws');
  });

  test('ZOUROBOROS_WORKSPACE takes precedence over ZO_WORKSPACE', () => {
    process.env.ZO_WORKSPACE = '/legacy';
    process.env.ZOUROBOROS_WORKSPACE = '/canonical';
    expect(getWorkspaceRoot()).toBe('/canonical');
  });
});

describe('getDataDir', () => {
  test('falls back to DEFAULT_DATA_DIR when no env var set', () => {
    expect(getDataDir()).toBe(DEFAULT_DATA_DIR);
  });

  test('honors ZOUROBOROS_DATA_DIR', () => {
    process.env.ZOUROBOROS_DATA_DIR = '/custom/data';
    expect(getDataDir()).toBe('/custom/data');
  });
});

describe('expandHome', () => {
  test('returns input unchanged if no leading ~', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path');
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  test('expands bare ~', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  test('expands ~/subpath', () => {
    expect(expandHome('~/foo/bar')).toBe(join(homedir(), 'foo/bar'));
  });

  test('does not expand ~user (only ~ and ~/)', () => {
    expect(expandHome('~someuser/foo')).toBe('~someuser/foo');
  });

  test('handles empty string', () => {
    expect(expandHome('')).toBe('');
  });
});
