/**
 * Core constants for Zouroboros
 */

import { join } from 'path';
import { homedir } from 'os';

export const ZOUROBOROS_VERSION = '2.0.0';

export const DEFAULT_CONFIG_PATH = join(homedir(), '.zouroboros', 'config.json');
export const DEFAULT_MEMORY_DB_PATH = join(homedir(), '.zouroboros', 'memory.db');
export const DEFAULT_PERSONAS_PATH = join(homedir(), '.zouroboros', 'personas');

export const DEFAULT_CONFIG = {
  version: ZOUROBOROS_VERSION,
  core: {
    workspace: '/home/workspace',
    logLevel: 'info' as const,
  },
  memory: {
    enabled: true,
    ollamaUrl: 'http://localhost:11434',
    embeddingModel: 'nomic-embed-text',
    hydeModel: 'qwen2.5:1.5b',
    dbPath: DEFAULT_MEMORY_DB_PATH,
    autoCapture: true,
  },
  swarm: {
    enabled: true,
    localConcurrency: 4,
    omniRouteEnabled: true,
    omniRouteUrl: 'http://localhost:20128/v1',
    executors: ['claude-code', 'codex', 'gemini', 'hermes'],
  },
  personas: {
    registryPath: DEFAULT_PERSONAS_PATH,
    autoLoad: true,
  },
  selfheal: {
    enabled: true,
    introspectSchedule: '0 5 * * *',
    autoEvolve: false,
    governor: true,
  },
};

export const EXECUTOR_REGISTRY_FILENAME = 'executor-registry.json';
