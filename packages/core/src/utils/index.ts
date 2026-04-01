/**
 * Utility functions for Zouroboros
 */

import { randomUUID } from 'crypto';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    backoffMultiplier?: number;
    maxBackoffMs?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, backoffMultiplier = 2, maxBackoffMs = 30000, onRetry } = options;
  
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      const backoffMs = Math.min(
        1000 * Math.pow(backoffMultiplier, attempt),
        maxBackoffMs
      );

      await sleep(backoffMs);
    }
  }

  throw lastError;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format milliseconds to human readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Parse a cron expression (simplified - only supports basic patterns)
 */
export function parseCron(expression: string): { minute: number; hour: number } {
  const parts = expression.split(' ');
  if (parts.length < 2) {
    throw new Error('Invalid cron expression');
  }
  
  const minute = parts[0] === '*' ? 0 : parseInt(parts[0], 10);
  const hour = parts[1] === '*' ? 0 : parseInt(parts[1], 10);
  
  if (isNaN(minute) || isNaN(hour)) {
    throw new Error('Invalid cron expression');
  }
  
  return { minute, hour };
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge two objects deeply
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== undefined) {
      if (isPlainObject(result[key]) && isPlainObject(source[key])) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  
  return result;
}
