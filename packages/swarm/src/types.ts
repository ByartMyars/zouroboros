/**
 * Core types for Zouroboros Swarm
 * 
 * @module zouroboros-swarm/types
 */

export type PriorityQueue = 'critical' | 'high' | 'medium' | 'low';
export type ComplexityTier = 'trivial' | 'simple' | 'moderate' | 'complex';
export type RoutingStrategy = 'fast' | 'reliable' | 'balanced' | 'explore';
export type DAGMode = 'streaming' | 'waves';
export type NotificationChannel = 'none' | 'sms' | 'email';
export type ErrorCategory = 'timeout' | 'rate_limited' | 'permission_denied' | 'context_overflow' | 'mutation_failed' | 'syntax_error' | 'runtime_error' | 'unknown';

export interface Task {
  id: string;
  persona: string;
  task: string;
  priority: PriorityQueue;
  executor?: string;
  agencyPersona?: string;
  dependsOn?: string[];
  memoryStrategy?: 'hierarchical' | 'sliding' | 'none';
  timeoutSeconds?: number;
  expectedMutations?: Array<{ file: string; contains: string }>;
  model?: string;
  outputToMemory?: boolean;
  memoryMetadata?: {
    category?: string;
    priority?: PriorityQueue;
    tags?: string[];
  };
}

export interface TaskResult {
  task: Task;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  retries: number;
  tokensUsed?: number;
}

export interface SwarmConfig {
  localConcurrency: number;
  timeoutSeconds: number;
  maxRetries: number;
  enableMemory: boolean;
  dagMode: DAGMode;
  notifyOnComplete: NotificationChannel;
  routingStrategy: RoutingStrategy;
  useSixSignalRouting: boolean;
  stagnationEnabled: boolean;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  totalFailures: number;
  lastFailure: number;
  lastSuccess: number;
  cooldownMs: number;
  probeInFlight: boolean;
  failureCategories: Map<ErrorCategory, number>;
}

export interface ExecutorCapability {
  id: string;
  name: string;
  expertise: string[];
  bestFor: string[];
  isLocal: boolean;
}

export interface ExecutorRegistryEntry {
  id: string;
  name: string;
  executor: 'local' | 'remote';
  bridge?: string;
  description: string;
  expertise: string[];
  bestFor: string[];
  config: {
    defaultTimeout: number;
    model?: string;
    envVars?: Record<string, string>;
  };
  healthCheck?: {
    command: string;
    expectedPattern: string;
    description: string;
  };
}

export interface RouteDecision {
  executorId: string;
  executorName: string;
  compositeScore: number;
  breakdown: {
    capability: number;
    health: number;
    complexityFit: number;
    history: number;
    procedure?: number;
    temporal?: number;
  };
  method: 'composite' | 'fallback';
}

export interface ErrorClassification {
  type: ErrorCategory;
  retryable: boolean;
  suggestedAction: string;
}

export interface SwarmCampaign {
  id: string;
  name: string;
  tasks: Task[];
  config: Partial<SwarmConfig>;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
