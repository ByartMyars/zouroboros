/**
 * Core types for Zouroboros
 * 
 * This file defines all shared types used across the Zouroboros ecosystem.
 */

// ============================================================================
// Base Types
// ============================================================================

export type UUID = string;
export type Timestamp = string; // ISO 8601
export type DecayClass = 'permanent' | 'long' | 'medium' | 'short';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ZouroborosConfig {
  version: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  core: CoreConfig;
  memory: MemoryConfig;
  swarm: SwarmConfig;
  personas: PersonasConfig;
  selfheal: SelfHealConfig;
}

export interface CoreConfig {
  workspaceRoot: string;
  dataDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  defaultTimezone: string;
}

export interface MemoryConfig {
  enabled: boolean;
  dbPath: string;
  vectorEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  autoCapture: boolean;
  captureIntervalMinutes: number;
  graphBoost: boolean;
  hydeExpansion: boolean;
  decayConfig: {
    permanent: number;
    long: number;      // days
    medium: number;    // days
    short: number;     // days
  };
}

export interface SwarmConfig {
  enabled: boolean;
  defaultCombo: string;
  maxConcurrency: number;
  localConcurrency: number;
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeoutMs: number;
  };
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  registryPath: string;
}

export interface PersonasConfig {
  enabled: boolean;
  identityDir: string;
  defaultSoulPath: string;
  autoCreateHeartbeat: boolean;
}


export interface SelfHealConfig {
  enabled: boolean;
  introspectionInterval: string; // cron expression
  autoPrescribe: boolean;
  governorEnabled: boolean;
  minHealthScore: number;
  metrics: Record<string, MetricThreshold>;
}

export interface MetricThreshold {
  target: number;
  weight: number;
  warningThreshold: number;
  criticalThreshold: number;
}

// ============================================================================
// Memory System Types
// ============================================================================

export interface MemoryEntry {
  id: UUID;
  entity: string;
  key: string | null;
  value: string;
  decay: DecayClass;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  embedding?: number[];
  tags?: string[];
}

export interface EpisodicMemory {
  id: UUID;
  conversationId: string;
  summary: string;
  outcome: 'success' | 'failure' | 'partial' | 'resolved' | 'ongoing';
  entities: string[];
  tags: string[];
  createdAt: Timestamp;
  tokenCount?: number;
}

export interface TemporalQuery {
  since?: string;
  until?: string;
  outcome?: string;
  limit?: number;
}

export interface ProceduralMemory {
  id: UUID;
  name: string;
  description: string;
  steps: string[];
  successRate: number;
  lastExecuted?: Timestamp;
  executionCount: number;
}

export interface CognitiveProfile {
  entity: string;
  traits: Record<string, number>;
  preferences: Record<string, string>;
  interactionHistory: InteractionRecord[];
  lastUpdated: Timestamp;
}

export interface InteractionRecord {
  timestamp: Timestamp;
  type: 'query' | 'store' | 'search';
  success: boolean;
  latencyMs: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  matchType: 'exact' | 'semantic' | 'graph' | 'hybrid';
}

export interface GraphNode {
  id: string;
  type: 'entity' | 'concept' | 'fact';
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

// ============================================================================
// Swarm Orchestration Types
// ============================================================================

export interface SwarmCampaign {
  id: UUID;
  name: string;
  description: string;
  tasks: SwarmTask[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface SwarmTask {
  id: UUID;
  name: string;
  description: string;
  dependencies: string[]; // task IDs
  executor: 'local';
  localExecutor?: string; // for local: claude-code, hermes, gemini, codex
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ExecutorBridge {
  name: string;
  type: 'local' | 'remote';
  command: string;
  healthCheck: string;
  envVars: string[];
  supportedModels?: string[];
}

export interface ExecutorRegistry {
  version: string;
  updatedAt: Timestamp;
  executors: Record<string, ExecutorConfig>;
}

export interface ExecutorConfig {
  name: string;
  bridge: string;
  healthCheck: string;
  timeoutSeconds: number;
  envVars: Record<string, string>;
}

// ============================================================================
// Combo Routing Types
// ============================================================================

export interface ComboRecommendation {
  complexity: ComplexityAnalysis;
  recommendedCombo: ModelCombo;
  alternatives: ComboAlternative[];
  resolvedCombo: string;
}

export interface ComplexityAnalysis {
  tier: 'trivial' | 'simple' | 'moderate' | 'complex';
  score: number;
  signals: ComplexitySignals;
  inferredTaskType: TaskType;
  staticCombo: string;
}

export interface ComplexitySignals {
  wordCount: number;
  fileCount: number;
  hasMultiStep: boolean;
  hasTool: boolean;
  hasAnalysis: boolean;
}

export type TaskType = 
  | 'coding' 
  | 'review' 
  | 'planning' 
  | 'analysis' 
  | 'debugging' 
  | 'documentation' 
  | 'general';

export interface ModelCombo {
  id: string;
  name: string;
  description: string;
  models: ModelConfig[];
  estimatedCostPer1M: number;
  traits: string[];
}

export interface ModelConfig {
  provider: string;
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface ComboAlternative {
  name: string;
  score: number;
  isFree: boolean;
}

// ============================================================================
// Workflow Types (Spec-First)
// ============================================================================

export interface SeedSpec {
  id: string;
  createdAt: Timestamp;
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  ontology: OntologyDef;
  evaluationPrinciples: EvaluationPrinciple[];
  exitConditions: ExitCondition[];
  ambiguityScore: number;
}

export interface OntologyDef {
  name: string;
  description: string;
  fields: OntologyField[];
}

export interface OntologyField {
  name: string;
  type: string;
  description: string;
}

export interface EvaluationPrinciple {
  name: string;
  description: string;
  weight: number;
}

export interface ExitCondition {
  name: string;
  description: string;
  criteria: string;
}

export interface EvaluationReport {
  id: string;
  seedId: string;
  timestamp: Timestamp;
  stages: {
    mechanical: MechanicalStage;
    semantic: SemanticStage;
    consensus?: ConsensusStage;
  };
  decision: 'APPROVED' | 'NEEDS_WORK' | 'REJECTED';
  recommendations: string[];
}

export interface MechanicalStage {
  passed: boolean;
  checks: MechanicalCheck[];
}

export interface MechanicalCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface SemanticStage {
  passed: boolean;
  score: number;
  acCompliance: number;
  drift: number;
  criteria: CriterionResult[];
}

export interface CriterionResult {
  name: string;
  met: boolean;
  evidence?: string;
}

export interface ConsensusStage {
  perspectives: Perspective[];
  finalDecision: 'APPROVE' | 'REJECT';
  reasoning: string;
}

export interface Perspective {
  role: 'proposer' | 'devils_advocate' | 'synthesizer';
  decision: 'APPROVE' | 'REJECT';
  reasoning: string;
}

export type UnstuckPersona = 'hacker' | 'researcher' | 'simplifier' | 'architect' | 'contrarian';

// ============================================================================
// Persona Types
// ============================================================================

export interface Persona {
  id: UUID;
  name: string;
  description: string;
  prompt: string;
  safetyRules: SafetyRule[];
  skills: string[];
  mcpServers: string[];
  identityFiles?: {
    soul?: string;
    identity?: string;
    user?: string;
    heartbeat?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SafetyRule {
  id: string;
  condition: string;
  instruction: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface IdentityFile {
  type: 'soul' | 'identity' | 'user' | 'heartbeat';
  path: string;
  content: string;
  lastUpdated: Timestamp;
}

// ============================================================================
// Self-Heal Types
// ============================================================================

export interface IntrospectionScorecard {
  id: string;
  timestamp: Timestamp;
  compositeScore: number;
  metrics: MetricScore[];
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  weakestSubsystem: string;
  opportunities: ImprovementOpportunity[];
}

export interface MetricScore {
  name: string;
  score: number;
  target: number;
  weight: number;
  trend: 'improving' | 'stable' | 'declining';
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface ImprovementOpportunity {
  rank: number;
  metric: string;
  currentScore: number;
  potentialImprovement: number;
  recommendedAction: string;
}

export interface Prescription {
  id: string;
  scorecardId: string;
  targetMetric: string;
  seed: SeedSpec;
  program?: AutoloopProgram;
  governorFlags: GovernorFlag[];
  approved: boolean;
  createdAt: Timestamp;
}

export interface GovernorFlag {
  type: 'schema_migration' | 'multi_file' | 'executor_change' | 'high_ambiguity' | 'no_baseline';
  severity: 'warning' | 'block';
  description: string;
}

export interface AutoloopProgram {
  name: string;
  metric: string;
  targetFile: string;
  runCommand: string;
  extractCommand: string;
  maxExperiments: number;
  maxDurationHours: number;
  maxCostUsd: number;
}

export interface EvolutionResult {
  id: string;
  prescriptionId: string;
  status: 'success' | 'failure' | 'reverted';
  baselineValue: number;
  finalValue: number;
  improvement: number;
  experiments: ExperimentRecord[];
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface ExperimentRecord {
  id: number;
  change: string;
  value: number;
  improved: boolean;
  committed: boolean;
}
