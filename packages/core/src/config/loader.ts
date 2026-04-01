/**
 * Configuration management for Zouroboros
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { ZouroborosConfig } from '../types.js';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH, VALID_LOG_LEVELS, VALID_LATENCY_PREFERENCES } from '../constants.js';
import { validateConfigSchema, formatValidationErrors } from './schema.js';

export { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH };
export { validateConfigSchema, formatValidationErrors } from './schema.js';
export type { ConfigValidationIssue } from './schema.js';

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
    selfheal: {
      ...DEFAULT_CONFIG.selfheal,
      ...partial.selfheal,
      metrics: { ...DEFAULT_CONFIG.selfheal.metrics, ...partial.selfheal?.metrics },
    },
  };
}

/**
 * Validate configuration structure using Zod schemas.
 * Throws ConfigValidationError with actionable messages on failure.
 */
export function validateConfig(config: unknown): ZouroborosConfig {
  if (typeof config !== 'object' || config === null) {
    throw new ConfigValidationError('Config must be an object', '');
  }

  const issues = validateConfigSchema(config);
  if (issues) {
    throw new ConfigValidationError(formatValidationErrors(issues), issues[0]?.path ?? '');
  }

  return config as ZouroborosConfig;
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
  const newConfig = structuredClone(config);
  let current: Record<string, unknown> = newConfig as unknown as Record<string, unknown>;

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
