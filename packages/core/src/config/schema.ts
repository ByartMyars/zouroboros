/**
 * Zod validation schemas for Zouroboros configuration
 *
 * Provides runtime validation with actionable error messages
 * for all configuration sections.
 */

import { z } from 'zod';

// ============================================================================
// Primitive Schemas
// ============================================================================

const cronExpression = z
  .string()
  .regex(/^[\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+$/, {
    message: 'Must be a valid 5-field cron expression (e.g., "0 5 * * *")',
  });

const absolutePath = z
  .string()
  .min(1, 'Path must not be empty')
  .refine((p) => p.startsWith('/') || p.startsWith('~'), {
    message: 'Path must be absolute (start with / or ~)',
  });

const urlString = z
  .string()
  .url('Must be a valid URL (e.g., "http://localhost:11434")');

const positiveInt = z
  .number()
  .int('Must be a whole number')
  .positive('Must be greater than 0');

const positiveNumber = z
  .number()
  .positive('Must be greater than 0');

const unitInterval = z
  .number()
  .min(0, 'Must be between 0 and 1')
  .max(1, 'Must be between 0 and 1');

// ============================================================================
// Section Schemas
// ============================================================================

export const CoreConfigSchema = z.object({
  workspaceRoot: absolutePath,
  dataDir: absolutePath,
  logLevel: z.enum(['debug', 'info', 'warn', 'error'], {
    errorMap: () => ({ message: 'logLevel must be one of: debug, info, warn, error' }),
  }),
  defaultTimezone: z
    .string()
    .min(1, 'Timezone must not be empty (e.g., "America/Phoenix", "UTC")'),
});

export const MemoryConfigSchema = z.object({
  enabled: z.boolean(),
  dbPath: absolutePath,
  vectorEnabled: z.boolean(),
  ollamaUrl: urlString,
  ollamaModel: z.string().min(1, 'Ollama model name must not be empty'),
  autoCapture: z.boolean(),
  captureIntervalMinutes: positiveInt.describe('Interval in minutes between auto-captures'),
  graphBoost: z.boolean(),
  hydeExpansion: z.boolean(),
  decayConfig: z.object({
    permanent: positiveNumber,
    long: positiveNumber,
    medium: positiveNumber,
    short: positiveNumber,
  }),
});

const CircuitBreakerSchema = z.object({
  enabled: z.boolean(),
  failureThreshold: positiveInt.describe('Number of failures before circuit opens'),
  resetTimeoutMs: positiveInt.describe('Milliseconds before circuit resets'),
});

const RetryConfigSchema = z.object({
  maxRetries: z.number().int().min(0, 'maxRetries must be 0 or greater'),
  backoffMultiplier: positiveNumber,
  maxBackoffMs: positiveInt,
});

export const SwarmConfigSchema = z.object({
  enabled: z.boolean(),
  defaultCombo: z.string().min(1, 'Default combo must not be empty'),
  maxConcurrency: positiveInt.describe('Max parallel tasks across all executors'),
  localConcurrency: positiveInt.describe('Max parallel tasks on local machine'),
  circuitBreaker: CircuitBreakerSchema,
  retryConfig: RetryConfigSchema,
  registryPath: absolutePath,
});

export const PersonasConfigSchema = z.object({
  enabled: z.boolean(),
  identityDir: absolutePath,
  defaultSoulPath: absolutePath,
  autoCreateHeartbeat: z.boolean(),
});

const MetricThresholdSchema = z
  .object({
    target: unitInterval,
    weight: unitInterval,
    warningThreshold: unitInterval,
    criticalThreshold: unitInterval,
  })
  .refine((m) => m.criticalThreshold <= m.warningThreshold, {
    message: 'criticalThreshold must be ≤ warningThreshold',
  })
  .refine((m) => m.warningThreshold <= m.target, {
    message: 'warningThreshold must be ≤ target',
  });

export const SelfHealConfigSchema = z.object({
  enabled: z.boolean(),
  introspectionInterval: cronExpression,
  autoPrescribe: z.boolean(),
  governorEnabled: z.boolean(),
  minHealthScore: z.number().min(0).max(100, 'minHealthScore must be 0-100'),
  metrics: z.record(z.string(), MetricThresholdSchema),
});

// ============================================================================
// Root Schema
// ============================================================================

export const ZouroborosConfigSchema = z.object({
  version: z.string().min(1),
  createdAt: z.string().min(1, 'createdAt timestamp is required'),
  updatedAt: z.string().min(1, 'updatedAt timestamp is required'),
  core: CoreConfigSchema,
  memory: MemoryConfigSchema,
  swarm: SwarmConfigSchema,
  personas: PersonasConfigSchema,
  selfheal: SelfHealConfigSchema,
});

// ============================================================================
// Helpers
// ============================================================================

export type ConfigValidationIssue = {
  path: string;
  message: string;
};

/**
 * Validate a config object and return structured errors.
 * Returns null if valid, or an array of issues with paths.
 */
export function validateConfigSchema(config: unknown): ConfigValidationIssue[] | null {
  const result = ZouroborosConfigSchema.safeParse(config);
  if (result.success) return null;

  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Format validation issues into a human-readable string.
 */
export function formatValidationErrors(issues: ConfigValidationIssue[]): string {
  const lines = ['Configuration validation failed:', ''];
  for (const issue of issues) {
    const location = issue.path ? `  ${issue.path}` : '  (root)';
    lines.push(`${location}: ${issue.message}`);
  }
  lines.push('');
  lines.push('Run "zouroboros config list" to see current values.');
  lines.push('Run "zouroboros config set <key> <value>" to fix.');
  return lines.join('\n');
}
