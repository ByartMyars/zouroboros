/**
 * Core types for Zouroboros
 */

export interface ZouroborosConfig {
  version: string;
  core: CoreConfig;
  memory: MemoryConfig;
  swarm: SwarmConfig;
  personas: PersonasConfig;
  selfheal: SelfHealConfig;
}

export interface CoreConfig {
  workspace: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface MemoryConfig {
  enabled: boolean;
  ollamaUrl: string;
  embeddingModel: string;
  hydeModel: string;
  dbPath: string;
  autoCapture: boolean;
}

export interface SwarmConfig {
  enabled: boolean;
  localConcurrency: number;
  omniRouteEnabled: boolean;
  omniRouteUrl: string;
  executors: string[];
}

export interface PersonasConfig {
  registryPath: string;
  autoLoad: boolean;
}

export interface SelfHealConfig {
  enabled: boolean;
  introspectSchedule: string;
  autoEvolve: boolean;
  governor: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  message?: string;
  details?: Record<string, unknown>;
}
