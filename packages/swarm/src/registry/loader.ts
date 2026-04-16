/**
 * Executor registry loader
 * 
 * Loads executor configurations from JSON registry files.
 */

import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import type { ExecutorRegistryEntry } from '../types.js';

const DEFAULT_REGISTRY_PATHS = [
  'Skills/zo-swarm-executors/registry/executor-registry.json',
  '.zouroboros/executors.json',
];

const WORKSPACE_ROOT = process.env.ZOUROBOROS_WORKSPACE_ROOT || '/home/workspace';

export interface Registry {
  executors: ExecutorRegistryEntry[];
  description?: string;
}

export function loadRegistry(customPath?: string): Registry {
  const paths = customPath ? [customPath] : DEFAULT_REGISTRY_PATHS;

  for (const path of paths) {
    const fullPath = isAbsolute(path) ? path : join(WORKSPACE_ROOT, path);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        const registry = JSON.parse(content) as Registry;
        return registry;
      } catch (err) {
        console.warn(`Failed to load registry from ${fullPath}:`, err);
      }
    }
  }
  
  // Return empty registry if none found
  return { executors: [], description: 'Empty default registry' };
}

export function findExecutor(registry: Registry, executorId: string): ExecutorRegistryEntry | undefined {
  return registry.executors.find(e => e.id === executorId);
}

export function listExecutors(registry: Registry): ExecutorRegistryEntry[] {
  return registry.executors;
}

export function getLocalExecutors(registry: Registry): ExecutorRegistryEntry[] {
  return registry.executors.filter(e => e.executor === 'local');
}
