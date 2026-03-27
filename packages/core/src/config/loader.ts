/**
 * Configuration management for Zouroboros
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { ZouroborosConfig, ZouroborosConfig as Config } from '../types.js';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH, VALID_LOG_LEVELS, VALID_LATENCY_PREFERENCES } from '../constants.js';

export { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH };

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public path: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load configuration from file or return defaults
 */
export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH): ZouroborosConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<ZouroborosConfig>;
    return mergeConfig(parsed);
  } catch (error) {
    throw new ConfigValidationError(
      `Failed to parse config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      configPath
    );
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: ZouroborosConfig, configPath: string = DEFAULT_CONFIG_PATH): void {
  const validated = validateConfig(config);
  validated.updatedAt = new Date().toISOString();
  
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(configPath, JSON.stringify(validated, null, 2), 'utf-8');
}

/**
 * Merge partial config with defaults
 */
export function mergeConfig(partial: Partial<ZouroborosConfig>): ZouroborosConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    core: { ...DEFAULT_CONFIG.core, ...partial.core },
    memory: { ...DEFAULT_CONFIG.memory, ...partial.memory },
    swarm: {
      ...DEFAULT_CONFIG.swarm,
      ...partial.swarm,
      circuitBreaker: { ...DEFAULT_CONFIG.swarm.circuitBreaker, ...partial.swarm?.circuitBreaker },
      retryConfig: { ...DEFAULT_CONFIG.swarm.retryConfig, ...partial.swarm?.retryConfig },
    },
    personas: { ...DEFAULT_CONFIG.personas, ...partial.personas },
    omniroute: { ...DEFAULT_CONFIG.omniroute, ...partial.omniroute },
    selfheal: {
      ...DEFAULT_CONFIG.selfheal,
      ...partial.selfheal,
      metrics: { ...DEFAULT_CONFIG.selfheal.metrics, ...partial.selfheal?.metrics },
    },
  };
}

/**
 * Validate configuration structure
 */
export function validateConfig(config: unknown): ZouroborosConfig {
  if (typeof config !== 'object' || config === null) {
    throw new ConfigValidationError('Config must be an object', '');
  }

  const cfg = config as Record<string, unknown>;

  // Validate core section
  if (cfg.core) {
    validateCoreConfig(cfg.core);
  }

  // Validate memory section
  if (cfg.memory) {
    validateMemoryConfig(cfg.memory);
  }

  // Validate swarm section
  if (cfg.swarm) {
    validateSwarmConfig(cfg.swarm);
  }

  // Validate omniroute section
  if (cfg.omniroute) {
    validateOmniRouteConfig(cfg.omniroute);
  }

  return config as ZouroborosConfig;
}

function validateCoreConfig(core: unknown): void {
  if (typeof core !== 'object' || core === null) {
    throw new ConfigValidationError('core must be an object', 'core');
  }

  const c = core as Record<string, unknown>;

  if (c.logLevel && !VALID_LOG_LEVELS.includes(c.logLevel as typeof VALID_LOG_LEVELS[number])) {
    throw new ConfigValidationError(
      `Invalid logLevel: ${c.logLevel}. Must be one of: ${VALID_LOG_LEVELS.join(', ')}`,
      'core.logLevel'
    );
  }
}

function validateMemoryConfig(memory: unknown): void {
  if (typeof memory !== 'object' || memory === null) {
    throw new ConfigValidationError('memory must be an object', 'memory');
  }

  const m = memory as Record<string, unknown>;

  if (m.captureIntervalMinutes !== undefined) {
    const interval = Number(m.captureIntervalMinutes);
    if (isNaN(interval) || interval < 1) {
      throw new ConfigValidationError(
        'captureIntervalMinutes must be a positive number',
        'memory.captureIntervalMinutes'
      );
    }
  }
}

function validateSwarmConfig(swarm: unknown): void {
  if (typeof swarm !== 'object' || swarm === null) {
    throw new ConfigValidationError('swarm must be an object', 'swarm');
  }

  const s = swarm as Record<string, unknown>;

  if (s.maxConcurrency !== undefined) {
    const concurrency = Number(s.maxConcurrency);
    if (isNaN(concurrency) || concurrency < 1) {
      throw new ConfigValidationError(
        'maxConcurrency must be a positive number',
        'swarm.maxConcurrency'
      );
    }
  }

  if (s.localConcurrency !== undefined) {
    const concurrency = Number(s.localConcurrency);
    if (isNaN(concurrency) || concurrency < 1) {
      throw new ConfigValidationError(
        'localConcurrency must be a positive number',
        'swarm.localConcurrency'
      );
    }
  }
}

function validateOmniRouteConfig(omniroute: unknown): void {
  if (typeof omniroute !== 'object' || omniroute === null) {
    throw new ConfigValidationError('omniroute must be an object', 'omniroute');
  }

  const o = omniroute as Record<string, unknown>;

  if (o.defaultLatency && !VALID_LATENCY_PREFERENCES.includes(o.defaultLatency as typeof VALID_LATENCY_PREFERENCES[number])) {
    throw new ConfigValidationError(
      `Invalid defaultLatency: ${o.defaultLatency}. Must be one of: ${VALID_LATENCY_PREFERENCES.join(', ')}`,
      'omniroute.defaultLatency'
    );
  }
}

/**
 * Get a nested config value by path
 */
export function getConfigValue<T>(config: ZouroborosConfig, path: string): T | undefined {
  const parts = path.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current as T;
}

/**
 * Set a nested config value by path
 */
export function setConfigValue<T>(
  config: ZouroborosConfig,
  path: string,
  value: T
): ZouroborosConfig {
  const parts = path.split('.');
  const newConfig = { ...config };
  let current: Record<string, unknown> = newConfig;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  newConfig.updatedAt = new Date().toISOString();

  return validateConfig(newConfig);
}

/**
 * Initialize configuration with interactive prompts
 */
export async function initConfig(options: {
  force?: boolean;
  workspaceRoot?: string;
  dataDir?: string;
} = {}): Promise<ZouroborosConfig> {
  const configPath = DEFAULT_CONFIG_PATH;

  if (existsSync(configPath) && !options.force) {
    throw new Error(`Config already exists at ${configPath}. Use --force to overwrite.`);
  }

  const config: ZouroborosConfig = {
    ...DEFAULT_CONFIG,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (options.workspaceRoot) {
    config.core.workspaceRoot = options.workspaceRoot;
  }

  if (options.dataDir) {
    config.core.dataDir = options.dataDir;
    config.memory.dbPath = join(options.dataDir, 'memory.db');
    config.swarm.registryPath = join(options.dataDir, 'executor-registry.json');
  }

  // Ensure data directory exists
  if (!existsSync(config.core.dataDir)) {
    mkdirSync(config.core.dataDir, { recursive: true });
  }

  saveConfig(config, configPath);
  return config;
}
