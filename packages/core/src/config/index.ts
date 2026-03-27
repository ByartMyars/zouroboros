/**
 * Configuration management for Zouroboros
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ZouroborosConfig, DEFAULT_CONFIG, DEFAULT_CONFIG_PATH } from '../constants.js';

export { DEFAULT_CONFIG, DEFAULT_CONFIG_PATH };

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
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: ZouroborosConfig, configPath: string = DEFAULT_CONFIG_PATH): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get a nested config value using dot notation
 */
export function getConfigValue<T>(config: ZouroborosConfig, key: string): T | undefined {
  const parts = key.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current as T;
}

/**
 * Set a nested config value using dot notation
 */
export function setConfigValue<T>(
  config: ZouroborosConfig,
  key: string,
  value: T
): ZouroborosConfig {
  const parts = key.split('.');
  const newConfig = { ...config };
  let current: Record<string, unknown> = newConfig;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return newConfig;
}
