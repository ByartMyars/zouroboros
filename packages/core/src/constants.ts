/**
 * Core constants for Zouroboros
 */

import { join } from 'path';
import { homedir } from 'os';
import type { ZouroborosConfig, MetricThreshold } from './types.js';

export const ZOUROBOROS_VERSION = '2.0.0';
export const ZOUROBOROS_NAME = 'Zouroboros';

// ============================================================================
// Paths
// ============================================================================

export const DEFAULT_WORKSPACE_ROOT = '/home/workspace';
export const DEFAULT_DATA_DIR = join(homedir(), '.zouroboros');
export const DEFAULT_CONFIG_DIR = DEFAULT_DATA_DIR;
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.json');

// ============================================================================
// Memory System Defaults
// ============================================================================

export const DEFAULT_MEMORY_DB_PATH = join(DEFAULT_DATA_DIR, 'memory.db');
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';
export const DEFAULT_CAPTURE_INTERVAL = 30; // minutes

export const DECAY_DAYS = {
  permanent: Infinity,
  long: 365,
  medium: 90,
  short: 30,
};

// ============================================================================
// Swarm Defaults
// ============================================================================

export const DEFAULT_SWARM_COMBO = 'swarm-mid';
export const DEFAULT_MAX_CONCURRENCY = 5;
export const DEFAULT_LOCAL_CONCURRENCY = 2;

export const CIRCUIT_BREAKER_DEFAULTS = {
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
};

export const RETRY_DEFAULTS = {
  maxRetries: 3,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
};

// ============================================================================
// Routing Service Defaults
// ============================================================================

export const DEFAULT_LATENCY_PREFERENCE = 'balanced';

// Complexity score thresholds
export const COMPLEXITY_THRESHOLDS = {
  trivial: 0.3,
  simple: 0.5,
  moderate: 0.7,
  complex: 1.0,
};

// Static combo mapping (fallback when external combo service is unavailable)
export const STATIC_COMBO_MAP: Record<string, string> = {
  trivial: 'swarm-light',
  simple: 'swarm-light',
  moderate: 'swarm-mid',
  complex: 'swarm-heavy',
};

// ============================================================================
// Self-Heal Defaults
// ============================================================================

export const DEFAULT_INTROSPECTION_CRON = '0 5 * * *'; // 5 AM daily
export const DEFAULT_MIN_HEALTH_SCORE = 70;

export const DEFAULT_METRIC_THRESHOLDS: Record<string, MetricThreshold> = {
  memoryRecall: {
    target: 0.85,
    weight: 0.25,
    warningThreshold: 0.75,
    criticalThreshold: 0.60,
  },
  graphConnectivity: {
    target: 0.80,
    weight: 0.15,
    warningThreshold: 0.70,
    criticalThreshold: 0.55,
  },
  routingAccuracy: {
    target: 0.85,
    weight: 0.20,
    warningThreshold: 0.75,
    criticalThreshold: 0.60,
  },
  evalCalibration: {
    target: 0.85,
    weight: 0.15,
    warningThreshold: 0.75,
    criticalThreshold: 0.60,
  },
  procedureFreshness: {
    target: 0.70,
    weight: 0.15,
    warningThreshold: 0.60,
    criticalThreshold: 0.45,
  },
  episodeVelocity: {
    target: 0.60,
    weight: 0.10,
    warningThreshold: 0.50,
    criticalThreshold: 0.35,
  },
};

// ============================================================================
// Default Configuration Object
// ============================================================================

export const DEFAULT_CONFIG: ZouroborosConfig = {
  version: ZOUROBOROS_VERSION,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  core: {
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    dataDir: DEFAULT_DATA_DIR,
    logLevel: 'info',
    defaultTimezone: 'America/Phoenix',
  },
  memory: {
    enabled: true,
    dbPath: DEFAULT_MEMORY_DB_PATH,
    vectorEnabled: true,
    ollamaUrl: DEFAULT_OLLAMA_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    autoCapture: true,
    captureIntervalMinutes: DEFAULT_CAPTURE_INTERVAL,
    graphBoost: true,
    hydeExpansion: true,
    decayConfig: DECAY_DAYS,
  },
  swarm: {
    enabled: true,
    defaultCombo: DEFAULT_SWARM_COMBO,
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    localConcurrency: DEFAULT_LOCAL_CONCURRENCY,
    circuitBreaker: CIRCUIT_BREAKER_DEFAULTS,
    retryConfig: RETRY_DEFAULTS,
    registryPath: join(DEFAULT_DATA_DIR, 'executor-registry.json'),
  },
  personas: {
    enabled: true,
    identityDir: join(DEFAULT_WORKSPACE_ROOT, 'IDENTITY'),
    defaultSoulPath: join(DEFAULT_WORKSPACE_ROOT, 'SOUL.md'),
    autoCreateHeartbeat: false,
  },
  selfheal: {
    enabled: true,
    introspectionInterval: DEFAULT_INTROSPECTION_CRON,
    autoPrescribe: false,
    governorEnabled: true,
    minHealthScore: DEFAULT_MIN_HEALTH_SCORE,
    metrics: DEFAULT_METRIC_THRESHOLDS,
  },
};

// ============================================================================
// Validation Constants
// ============================================================================

export const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const VALID_LATENCY_PREFERENCES = ['fast', 'balanced', 'quality'] as const;
export const VALID_DECAY_CLASSES = ['permanent', 'long', 'medium', 'short'] as const;
export const VALID_TASK_TYPES = [
  'coding',
  'review',
  'planning',
  'analysis',
  'debugging',
  'documentation',
  'general',
] as const;

// ============================================================================
// File Patterns
// ============================================================================

export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.zouroboros/**',
  '*.log',
  '*.tmp',
  '.env*',
];

export const MEMORY_FILE_EXTENSIONS = ['.md', '.txt', '.ts', '.js', '.json', '.yaml', '.yml'];

// ============================================================================
// CLI Constants
// ============================================================================

export const CLI_COMMANDS = [
  'init',
  'doctor',
  'config',
  'memory',
  'swarm',
  'persona',
  'workflow',
  'selfheal',
] as const;

export const MEMORY_SUBCOMMANDS = [
  'store',
  'search',
  'hybrid',
  'graph',
  'capture',
  'stats',
] as const;

export const SWARM_SUBCOMMANDS = [
  'run',
  'status',
  'registry',
  'bridges',
] as const;

export const PERSONA_SUBCOMMANDS = [
  'create',
  'list',
  'activate',
  'deactivate',
] as const;

export const WORKFLOW_SUBCOMMANDS = [
  'interview',
  'evaluate',
  'unstuck',
] as const;

export const SELFHEAL_SUBCOMMANDS = [
  'introspect',
  'prescribe',
  'evolve',
] as const;
