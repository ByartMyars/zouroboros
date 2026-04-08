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
export type DelegationMode = 'auto' | 'disabled';

export interface ChildWriteScope {
  childId: string;
  paths: string[];
}

export interface TaskDelegationConfig {
  mode?: DelegationMode;
  maxChildren?: number;
  writeScopes?: ChildWriteScope[];
}

export interface ChildTaskRecord {
  childId: string;
  parentTaskId: string;
  executorId: string;
  delegatedModel?: string;
  writeScope?: string[];
  toolset?: string[];
  status: 'success' | 'failure' | 'blocked' | 'skipped';
  durationMs?: number;
  artifacts?: string[];
  source?: 'executor_bridge' | 'parent_summary' | 'logger_synthesis';
  summary?: string;
}

export interface HierarchicalDelegationConfig {
  enabled: boolean;
  maxDepth: number;
  defaultMode: DelegationMode;
  claudeCodeMaxChildren: number;
  hermesMaxChildren: number;
}

export interface Task {
  id: string;
  persona: string;
  task: string;
  priority: PriorityQueue;
  executor?: string;
  agencyPersona?: string;
  role?: string;
  dependsOn?: string[];
  memoryStrategy?: 'hierarchical' | 'sliding' | 'none';
  timeoutSeconds?: number;
  expectedMutations?: Array<{ file: string; contains: string }>;
  model?: string;
  delegation?: TaskDelegationConfig;
  outputToMemory?: boolean;
  ragContext?: string;
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
  artifacts?: string[];
  childRecords?: ChildTaskRecord[];
  delegated?: boolean;
  modelUsed?: string;
  effectiveExecutor?: string;
}

export interface LoopGuardConfig {
  /** Maximum DAG nesting depth before a LoopDetectedError is thrown. Default: 10 */
  maxLoopDepth: number;
  /** Milliseconds before a recursive chain times out. Default: 30000 */
  loopTimeoutMs: number;
  /** Whether to open the circuit breaker on loop detection. Default: true */
  openCircuitOnLoop: boolean;
}

export interface RAGEnrichmentConfig {
  enabled: boolean;
  topK?: number;
  minScore?: number;
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
  hierarchicalDelegation?: HierarchicalDelegationConfig;
  ragEnrichment?: RAGEnrichmentConfig;
  loopGuard?: Partial<LoopGuardConfig>;
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

export interface ExecutorCapabilities {
  fileRead: boolean;
  fileWrite: boolean;
  shellExec: boolean;
  webResearch: boolean;
  imageGen: boolean;
  mcp: boolean;
  streaming: boolean;
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
  transport?: 'bridge' | 'acp';
  capabilities?: ExecutorCapabilities;
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
    budget?: number;
    role?: number;
  };
  method: 'composite' | 'fallback';
}

export interface BudgetSnapshot {
  totalSpentUSD: number;
  totalBudgetUSD: number;
  perExecutor: Record<string, number>;
}

export interface HealthSnapshot {
  [executorId: string]: { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; failures: number };
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
