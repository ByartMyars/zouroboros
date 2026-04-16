#!/usr/bin/env bun
/**
 * Swarm Orchestrator v5.0.0 — Current TypeScript Runtime
 *
 * This is the current full-featured TypeScript runtime with:
 * - Circuit Breaker V2 (CLOSED/OPEN/HALF_OPEN with probes)
 * - Backpressure monitoring
 * - 6-signal composite routing (+procedure, +temporal)
 * - Dynamic model routing with caching
 * - Error classification (8 categories)
 * - Agency persona resolution
 * - Pre-flight validation
 * - Streaming & wave DAG execution modes
 * - Memory gate integration
 * - Wikilink resolution
 * - Token-optimized memory strategies
 * - Notifications (SMS/Email)
 * - Cognitive profiles
 * - Stagnation detection + auto-unstuck
 * - Mutation verification
 * - Circuit breaker persistence
 *
 * Usage:
 *   bun orchestrate-v5.ts <tasks.json> [options]
 *   bun orchestrate-v5.ts status <swarm-id>
 *   bun orchestrate-v5.ts doctor
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { spawn, spawnSync } from "child_process";
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

// ============================================================================
// IMPORTS FROM EXISTING MODULES
// ============================================================================

// Tier resolve for dynamic model routing
import {
  inferTaskType,
  estimateComplexitySync,
  TIER_TO_COMBO as STATIC_TIER_TO_COMBO,
  type TaskType,
  type ComplexityEstimate as TierResolveEstimate,
} from "./tier-resolve";

// Swarm memory and token optimizer
import { SwarmMemory, getSwarmMemory, ContextAccessMode, MemoryQuery } from "./swarm-memory";
import { HierarchicalMemory, SlidingWindowMemory, MemoryItem, MemoryStrategy } from "./token-optimizer";

// v5.1: RAG enrichment — auto-inject relevant SDK patterns from Agentic RAG
import { enrichTaskWithRAG, shouldEnrichWithRAG } from "./rag-enrichment";
import { getMemoryDbPath } from "zouroboros-core";

// ============================================================================
// PATHS & CONFIG
// ============================================================================

const WORKSPACE = process.env.SWARM_WORKSPACE || "/home/workspace";
const HOME = process.env.HOME || "/root";
const SWARM_DIR = join(HOME, ".swarm");
const LOGS_DIR = join(SWARM_DIR, "logs");
const RESULTS_DIR = join(SWARM_DIR, "results");
const HISTORY_DB = join(SWARM_DIR, "executor-history.db");
const HISTORY_JSON = join(SWARM_DIR, "executor-history.json");
const CIRCUIT_STATE_FILE = join(SWARM_DIR, "circuit-breaker-state.json");
const MEMORY_DB = getMemoryDbPath();
const REGISTRY = join(WORKSPACE, "Skills", "zo-swarm-executors", "registry", "executor-registry.json");
const PERSONA_REGISTRY = join(WORKSPACE, "Skills", "zo-swarm-orchestrator", "assets", "persona-registry.json");
const AGENCY_PERSONAS = join(WORKSPACE, "agency-agents-personas.json");
const LOCK_DIR = "/dev/shm";

// Ensure directories exist
[LOGS_DIR, RESULTS_DIR].forEach(d => mkdirSync(d, { recursive: true }));

// ============================================================================
// CONSTANTS
// ============================================================================

const CB_MAX_COOLDOWN_MS = 300_000; // 5 min cap
const CB_BACKOFF_MULTIPLIER = 2.0;
const CB_PERSIST_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour max age

// Error classification categories
const ERROR_CATEGORIES = [
  "timeout",
  "rate_limited",
  "permission_denied",
  "context_overflow",
  "mutation_failed",
  "syntax_error",
  "runtime_error",
  "unknown",
] as const;
type ErrorCategory = typeof ERROR_CATEGORIES[number];

// Category-aware failure thresholds
const CB_FAILURE_THRESHOLDS: Record<ErrorCategory, number> = {
  timeout: 2,
  rate_limited: 1,
  permission_denied: 1,
  context_overflow: 2,
  mutation_failed: 3,
  syntax_error: 3,
  runtime_error: 3,
  unknown: 3,
};

// Category-aware base cooldowns (ms)
const CB_BASE_COOLDOWN_MS: Record<ErrorCategory, number> = {
  rate_limited: 60_000,
  permission_denied: 300_000,
  timeout: 30_000,
  context_overflow: 30_000,
  mutation_failed: 15_000,
  syntax_error: 15_000,
  runtime_error: 15_000,
  unknown: 30_000,
};

// Complexity affinity matrix
const COMPLEXITY_AFFINITY: Record<string, Record<string, number>> = {
  "codex":       { trivial: 0.90, simple: 0.85, moderate: 0.55, complex: 0.30 },
  "gemini":      { trivial: 0.75, simple: 0.80, moderate: 0.90, complex: 0.85 },
  "hermes":      { trivial: 0.70, simple: 0.75, moderate: 0.85, complex: 0.80 },
  "claude-code": { trivial: 0.65, simple: 0.75, moderate: 0.90, complex: 1.00 },
};

// Routing strategy weights (4-signal)
const STRATEGY_WEIGHTS = {
  fast:     { capability: 0.15, health: 0.25, complexityFit: 0.45, history: 0.15 },
  reliable: { capability: 0.20, health: 0.45, complexityFit: 0.15, history: 0.20 },
  balanced: { capability: 0.30, health: 0.35, complexityFit: 0.20, history: 0.15 },
  explore:  { capability: 0.40, health: 0.16, complexityFit: 0.18, history: 0.16, procedure: 0.10, temporal: 0.05 },
};

// 6-signal weights
const STRATEGY_WEIGHTS_6SIGNAL = {
  fast:     { capability: 0.12, health: 0.20, complexityFit: 0.40, history: 0.12, procedure: 0.08, temporal: 0.08 },
  reliable: { capability: 0.15, health: 0.35, complexityFit: 0.12, history: 0.18, procedure: 0.12, temporal: 0.08 },
  balanced: { capability: 0.25, health: 0.28, complexityFit: 0.16, history: 0.15, procedure: 0.10, temporal: 0.06 },
  explore:  { capability: 0.35, health: 0.16, complexityFit: 0.18, history: 0.16, procedure: 0.10, temporal: 0.05 },
};

// Shared swarm tier mapping
const TIER_TO_COMBO: Record<string, string> = { ...STATIC_TIER_TO_COMBO };
const COMBO_CACHE_TTL_MS = 60_000;

// ============================================================================
// TIER RESOLVE WEIGHTS (required by tier-resolve module)
// ============================================================================

type WeightConfig = Record<string, any>;
type RouterWeights = Record<string, number>;

const DEFAULT_WEIGHTS: RouterWeights = {
  wordCount: 0.04,
  fileRefs: 0.02,
  multiStep: 0.10,
  toolUsage: 0.04,
  analysisDepth: 0.08,
  domainComplexity: 0.10,
  techStackDepth: 0.10,
  conceptCount: 0.20,
  taskVerbComplexity: 0.10,
  scopeBreadth: 0.12,
  featureListCount: 0.20,
};

// Combo cache
let _comboCache: { data: any[]; fetchedAt: number } | null = null;

// ============================================================================
// TYPES
// ============================================================================

type PriorityQueue = "critical" | "high" | "medium" | "low";
type ComplexityTier = "trivial" | "simple" | "moderate" | "complex";
type RoutingStrategy = "fast" | "reliable" | "balanced" | "explore";
type DAGMode = "streaming" | "waves";
type NotificationChannel = "none" | "sms" | "email";

interface Task {
  id: string;
  persona: string;
  task: string;
  priority: PriorityQueue;

  // Separate executor from persona
  executor?: string;
  agencyPersona?: string;

  // DAG dependencies
  dependsOn?: string[];

  // v5.2: Cascade mitigation - dependency failure handling
  onDependencyFailure?: "abort" | "degrade" | "retry" | "inherit";
  taskType?: "analysis" | "mutation" | "hybrid" | "auto";
  maxRetriesOnDegraded?: number;

  // Memory configuration
  memoryStrategy?: "hierarchical" | "sliding" | "none";
  contextAccess?: ContextAccessMode;
  contextQuery?: MemoryQuery;
  contextTags?: string[];
  outputToMemory?: boolean;
  memoryMetadata?: {
    category?: string;
    priority?: PriorityQueue;
    tags?: string[];
    previousAttemptContext?: {
      previous_executor: string;
      error_type: string;
      error: string;
      suggested_action: string;
      suggested_persona?: string;
      stagnation_score?: number;
    };
  };

  // Task configuration
  timeoutSeconds?: number;
  expectedMutations?: Array<{ file: string; contains: string }>;
  model?: string;
}

interface TaskResult {
  task: Task;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  retries: number;
  tokensUsed?: number;
}

interface OrchestratorConfig {
  localConcurrency: number;
  timeoutSeconds: number;
  maxRetries: number;
  enableMemory: boolean;
  defaultMemoryStrategy: MemoryStrategy;
  maxContextTokens: number;
  crossTaskContextWindow: number;
  dagMode: DAGMode;
  memoryDbPath?: string;
  modelName?: string;
  notifyOnComplete: NotificationChannel;
  routingStrategy: RoutingStrategy;
  useSixSignalRouting: boolean;
  // API fallback (disabled)
  omniRouteEnabled: boolean;
  omniRouteUrl?: string;
  omniRouteModel?: string;
  omniRouteApiKey?: string;
  omniRouteBudgetTokens: number;
  // Intelligence features
  stagnationEnabled: boolean;
  autoUnstuckMode: "log" | "advisory" | "activate";
  enableStreamingCapture: boolean;
  // Cascade
  cascadeMode: boolean;
}

// Circuit Breaker V2
interface CircuitBreakerV2 {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  totalFailures: number;
  lastFailure: number;
  lastSuccess: number;
  cooldownMs: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
  backoffMultiplier: number;
  probeInFlight: boolean;
  failureCategories: Map<ErrorCategory, number>;
}

// Backpressure monitoring
interface BackpressureState {
  executorId: string;
  recentDurationsMs: number[];
  baselineDurationMs: number;
  pressureScore: number;
  trend: "improving" | "stable" | "degrading";
}

// Local executor
interface LocalExecutor {
  id: string;
  bridge: string;
  name: string;
}

// Executor capability
interface ExecutorCapability {
  id: string;
  name: string;
  expertise: string[];
  bestFor: string[];
  isLocal: boolean;
}

// Route decision
interface RouteDecision {
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
  method: "composite" | "fallback";
}

// Stagnation signal
interface StagnationSignal {
  stagnationScore: number;
  isStagnant: boolean;
  windowSize: number;
  consecutiveSimilarity: number[];
  suggestedPersona: string;
  trigger: "similarity" | "timeout" | "mutation" | "none";
}

// Error classification
interface ErrorClassification {
  type: ErrorCategory;
  retryable: boolean;
  suggestedAction: string;
}

// Cognitive profile
interface CognitiveProfile {
  executorId: string;
  category: string;
  attempts: number;
  successes: number;
  avgDurationMs: number;
  failurePatterns: Map<string, number>;
  entityAffinities: Map<string, number>;
}

// API fallback health
interface ApiFallbackHealthState {
  circuitOpen: boolean;
  consecutiveFailures: number;
  lastFailure: number;
  budgetUsedTokens: number;
}

// Persisted circuit state
interface PersistedCircuitState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  totalFailures: number;
  cooldownMs: number;
  lastFailure: number;
  lastSuccess: number;
  failureCategories: Record<string, number>;
  savedAt: number;
  backpressure?: {
    baselineDurationMs: number;
    pressureScore: number;
  };
}

// Progress data
interface ProgressData {
  ts: string;
  swarmId: string;
  totalTasks: number;
  completed: number;
  failed: number;
  percentComplete: number;
  elapsedMs: number;
  status: string;
  personaMappings?: Record<string, string>;
}

// ============================================================================
// CASCADE MITIGATION v5.2
// ============================================================================

type TaskTypeClassification = "analysis" | "mutation" | "hybrid";
type DependencyFailurePolicy = "abort" | "degrade" | "retry" | "inherit";

interface CascadeEvent {
  swarmId: string;
  taskId: string;
  eventType: "dependency_failed" | "degraded_execution" | "partial_input_assembly" | "cascade_complete";
  failedDependencyId: string;
  policy: DependencyFailurePolicy;
  taskType: TaskTypeClassification;
  completedDeps: string[];
  failedDeps: string[];
  degraded: boolean;
  timestamp: number;
}

interface PartialInputContext {
  availableOutputs: Array<{ taskId: string; executor: string; summary: string; output?: string }>;
  missingDependencies: string[];
  warningAnnotation: string;
  confidenceScore: number; // 0-1 based on % of deps available
}

/**
 * Classifies tasks based on keywords and expected mutations
 */
function classifyTaskType(task: Task): TaskTypeClassification {
  if (task.taskType && task.taskType !== "auto") {
    return task.taskType as TaskTypeClassification;
  }

  // Auto-classify based on task description and expected mutations
  const lowerTask = task.task.toLowerCase();
  
  // Mutation indicators
  const mutationKeywords = [
    "create", "write", "edit", "update", "delete", "modify", "refactor",
    "implement", "add", "remove", "change", "fix", "migrate", "deploy"
  ];
  
  // Analysis indicators  
  const analysisKeywords = [
    "analyze", "review", "audit", "evaluate", "assess", "compare",
    "research", "investigate", "check", "validate", "verify",
    "summarize", "report", "explain", "document"
  ];

  const hasMutationKeywords = mutationKeywords.some(kw => lowerTask.includes(kw));
  const hasAnalysisKeywords = analysisKeywords.some(kw => lowerTask.includes(kw));
  const hasExpectedMutations = task.expectedMutations && task.expectedMutations.length > 0;

  if (hasExpectedMutations || (hasMutationKeywords && !hasAnalysisKeywords)) {
    return "mutation";
  }
  if (hasAnalysisKeywords && !hasMutationKeywords) {
    return "analysis";
  }
  return "hybrid";
}

/**
 * Determines the effective policy for a task, handling "inherit"
 */
function resolvePolicy(task: Task, defaultPolicy: DependencyFailurePolicy): DependencyFailurePolicy {
  const policy = task.onDependencyFailure || "inherit";
  if (policy === "inherit") {
    return defaultPolicy;
  }
  return policy;
}

/**
 * Assembles partial inputs from completed dependencies
 */
function assemblePartialInputs(
  task: Task,
  completed: Set<string>,
  failed: Set<string>,
  taskResults: Map<string, TaskResult>
): PartialInputContext {
  const deps = task.dependsOn || [];
  const availableOutputs: Array<{ taskId: string; executor: string; summary: string; output?: string }> = [];
  const missingDependencies: string[] = [];

  for (const depId of deps) {
    if (completed.has(depId)) {
      const result = taskResults.get(depId);
      if (result && result.success) {
        // Extract summary (first 200 chars)
        const summary = result.output
          ? result.output.slice(0, 200).replace(/\s+/g, " ") + "..."
          : "Completed successfully";
        availableOutputs.push({
          taskId: depId,
          executor: getEffectiveExecutor(result.task),
          summary,
          output: result.output,
        });
      }
    } else if (failed.has(depId)) {
      missingDependencies.push(depId);
    }
  }

  const totalDeps = deps.length;
  const availableCount = availableOutputs.length;
  const confidenceScore = totalDeps > 0 ? availableCount / totalDeps : 1.0;

  const warningAnnotation = missingDependencies.length > 0
    ? `\n⚠️  DEGRADED EXECUTION NOTICE ⚠️\n` +
      `This task is running with partial inputs due to failed dependencies: ${missingDependencies.join(", ")}\n` +
      `Proceed with caution - some context may be missing.\n` +
      `Available context confidence: ${(confidenceScore * 100).toFixed(0)}%\n`
    : "";

  return {
    availableOutputs,
    missingDependencies,
    warningAnnotation,
    confidenceScore,
  };
}

/**
 * Logs cascade events to zo-memory-system
 */
function logCascadeEvent(event: CascadeEvent): void {
  try {
    // Log to NDJSON for local tracking
    const logPath = join(LOGS_DIR, `${event.swarmId}-cascade.ndjson`);
    const entry = JSON.stringify({
      ts: new Date(event.timestamp).toISOString(),
      ...event,
    }) + "\n";
    writeFileSync(logPath, entry, { flag: "a" });

    // Also log as episode tag for memory system
    if (existsSync(MEMORY_DB)) {
      const db = new Database(MEMORY_DB);
      // Find the most recent episode for this swarm
      const episode = db.query(
        "SELECT id FROM episodes WHERE metadata LIKE ? ORDER BY happened_at DESC LIMIT 1"
      ).get(`%${event.swarmId}%`) as { id: number } | null;

      if (episode) {
        // Store cascade event as fact with episode reference
        db.run(
          `INSERT INTO facts (entity, key, value, decay_class, created_at, confidence)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            `cascade.${event.swarmId}`,
            `event.${event.taskId}`,
            JSON.stringify(event),
            "session",
            Math.floor(event.timestamp / 1000),
            event.degraded ? 0.7 : 0.9,
          ]
        );
      }
      db.close();
    }
  } catch {
    // Non-blocking: cascade logging failures shouldn't stop execution
  }
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  localConcurrency: 8,
  timeoutSeconds: 600,
  maxRetries: 3,
  enableMemory: true,
  defaultMemoryStrategy: "hierarchical",
  maxContextTokens: 16000,
  crossTaskContextWindow: 3,
  dagMode: "streaming",
  notifyOnComplete: "none",
  routingStrategy: "balanced",
  useSixSignalRouting: true,
  omniRouteEnabled: false,
  omniRouteUrl: undefined,
  omniRouteModel: undefined,
  omniRouteApiKey: undefined,
  omniRouteBudgetTokens: 50000,
  stagnationEnabled: true,
  autoUnstuckMode: "log",
  enableStreamingCapture: false,
  cascadeMode: true,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function nlog(path: string, event: string, extra: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...extra,
  });
  try {
    writeFileSync(path, entry + "\n", { flag: "a" });
  } catch {}
}

// Wikilink resolution
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
function resolveOutputWikilinks(output: string): string {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  const seen = new Set<string>();
  while ((m = WIKILINK_RE.exec(output)) !== null) {
    const entity = m[1].trim();
    if (!seen.has(entity)) {
      seen.add(entity);
      matches.push(entity);
    }
  }
  if (matches.length === 0) return "";
  try {
    const dbPath = process.env.ZO_MEMORY_DB || MEMORY_DB;
    const db = new Database(dbPath, { readonly: true });
    const nowSec = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(
      "SELECT entity, key, value FROM facts WHERE entity = ? AND value != '' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1"
    );
    const entries: string[] = [];
    for (const entity of matches) {
      const row = stmt.get(entity, nowSec) as { entity: string; key: string; value: string } | null;
      if (row) {
        entries.push(`- [[${row.entity}]].${row.key}: ${row.value.slice(0, 150)}`);
      }
    }
    db.close();
    if (entries.length === 0) return "";
    return `\n### Resolved Wikilinks\n${entries.join("\n")}`;
  } catch {
    return "";
  }
}

// Token estimation (approximate)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Truncate to budget
function truncateToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...[truncated]";
}

// Jaccard similarity for stagnation detection
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ============================================================================
// CIRCUIT BREAKER V2
// ============================================================================

/**
 * Check if a task can be started based on dependency status
 * In streaming DAG mode, this is always true as we check deps separately
 */
function canRun(task: Task): boolean {
  return true;
}

/**
 * Circuit breaker state machine: check if an attempt can proceed
 * OPEN = no attempts allowed
 * HALF_OPEN = one probe attempt allowed
 * CLOSED = unlimited attempts
 */
function canAttempt(cb: CircuitBreakerV2): boolean {
  if (cb.state === "CLOSED") return true;
  if (cb.state === "OPEN") {
    if (Date.now() - cb.lastFailure > cb.cooldownMs) {
      cb.state = "HALF_OPEN";
      cb.probeInFlight = false;
      return !cb.probeInFlight;
    }
    return false;
  }
  if (cb.state === "HALF_OPEN") {
    return !cb.probeInFlight;
  }
  return false;
}

/**
 * Record a successful execution on the circuit breaker
 */
function recordSuccess(cb: CircuitBreakerV2): void {
  cb.failures = 0;
  cb.lastSuccess = Date.now();
  if (cb.state === "HALF_OPEN") {
    cb.state = "CLOSED";
    cb.cooldownMs = cb.baseCooldownMs;
  }
  cb.probeInFlight = false;
}

/**
 * Record a failed execution on the circuit breaker
 */
function recordFailure(cb: CircuitBreakerV2, category?: ErrorCategory): void {
  cb.failures++;
  cb.totalFailures++;
  cb.lastFailure = Date.now();
  if (category) {
    cb.failureCategories.set(category, (cb.failureCategories.get(category) || 0) + 1);
  }
  const threshold = category ? CB_FAILURE_THRESHOLDS[category] : 3;
  if (cb.state === "HALF_OPEN") {
    cb.state = "OPEN";
    cb.cooldownMs = Math.min(cb.cooldownMs * cb.backoffMultiplier, CB_MAX_COOLDOWN_MS);
    cb.probeInFlight = false;
  } else if (cb.failures >= threshold) {
    cb.state = "OPEN";
    if (category) {
      cb.baseCooldownMs = CB_BASE_COOLDOWN_MS[category];
      cb.cooldownMs = cb.baseCooldownMs;
    }
  }
}

/**
 * Record executor history for performance and outcome tracking
 */
function recordHistory(exid: string, cat: string, ok: boolean, ms: number): void {
  try {
    const db = new Database(HISTORY_DB);
    const now = Math.floor(Date.now() / 1000);
    db.run(`INSERT INTO executor_history (executor,category,attempts,successes,avg_ms,last_updated)
      VALUES (?,?,1,?,?,?) ON CONFLICT(executor,category)
      DO UPDATE SET attempts=attempts+1, successes=successes+?,
      avg_ms=(avg_ms*(attempts-1)+?)/attempts, last_updated=?`,
      [exid, cat || "general", ok ? 1 : 0, ms, now, ok ? 1 : 0, ms, now]);
    db.close();
  } catch {}
}

/**
 * Create a default fresh circuit breaker for a new executor
 */
function createDefaultCircuitBreaker(): CircuitBreakerV2 {
  return {
    state: "CLOSED",
    failures: 0,
    totalFailures: 0,
    lastFailure: 0,
    lastSuccess: 0,
    cooldownMs: 30_000,
    baseCooldownMs: 30_000,
    maxCooldownMs: CB_MAX_COOLDOWN_MS,
    backoffMultiplier: CB_BACKOFF_MULTIPLIER,
    probeInFlight: false,
    failureCategories: new Map(),
  };
}

// ============================================================================
// BACKPRESSURE MONITORING
// ============================================================================

function createDefaultBackpressure(executorId: string): BackpressureState {
  return {
    executorId,
    recentDurationsMs: [],
    baselineDurationMs: 30_000,
    pressureScore: 0.0,
    trend: "stable",
  };
}

function updateBackpressure(state: BackpressureState, durationMs: number): void {
  state.recentDurationsMs.push(durationMs);
  if (state.recentDurationsMs.length > 10) state.recentDurationsMs.shift();

  const avgRecent = state.recentDurationsMs.reduce((a, b) => a + b, 0) / state.recentDurationsMs.length;
  const ratio = state.baselineDurationMs > 0 ? avgRecent / state.baselineDurationMs : 1.0;

  if (ratio < 1.5) state.pressureScore = 0.0;
  else if (ratio < 2.0) state.pressureScore = 0.3;
  else if (ratio < 3.0) state.pressureScore = 0.6;
  else state.pressureScore = 0.9;

  if (state.recentDurationsMs.length >= 5) {
    const firstHalf = state.recentDurationsMs.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const secondHalf = state.recentDurationsMs.slice(-5).reduce((a, b) => a + b, 0) / 5;
    state.trend = secondHalf < firstHalf * 0.9 ? "improving"
      : secondHalf > firstHalf * 1.1 ? "degrading" : "stable";
  }
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

function classifyError(errorStr: string): ErrorClassification {
  const e = errorStr.toLowerCase();

  if (e.includes("timeout") || e.includes("deadline exceeded") || e.includes("timed out")) {
    return { type: "timeout", retryable: true, suggestedAction: "Retry with longer timeout or reduce task scope" };
  }
  if (e.includes("rate limit") || e.includes("too many requests") || e.includes("429")) {
    return { type: "rate_limited", retryable: true, suggestedAction: "Wait and retry with exponential backoff" };
  }
  if (e.includes("permission") || e.includes("unauthorized") || e.includes("403") || e.includes("access denied")) {
    return { type: "permission_denied", retryable: false, suggestedAction: "Check credentials and permissions" };
  }
  if (e.includes("context") || e.includes("token") || e.includes("too long") || e.includes("maximum context")) {
    return { type: "context_overflow", retryable: true, suggestedAction: "Reduce prompt size or split into smaller tasks" };
  }
  if (e.includes("mutation") || e.includes("expected file") || e.includes("must contain")) {
    return { type: "mutation_failed", retryable: true, suggestedAction: "Verify file paths and mutation constraints" };
  }
  if (e.includes("syntax") || e.includes("parse error") || e.includes("unexpected token")) {
    return { type: "syntax_error", retryable: false, suggestedAction: "Fix syntax in task description or code" };
  }
  if (e.includes("runtime") || e.includes("execution") || e.includes("exception")) {
    return { type: "runtime_error", retryable: true, suggestedAction: "Review runtime environment and dependencies" };
  }

  return { type: "unknown", retryable: true, suggestedAction: "Investigate error and retry" };
}

// ============================================================================
// STAGNATION DETECTION
// ============================================================================

const STAGNATION_THRESHOLD = 0.85;
const STAGNATION_WINDOW = 3;

function detectStagnation(
  recentOutputs: string[],
  currentTask: Task,
  elapsedMs: number,
  timeoutMs: number
): StagnationSignal {
  const signal: StagnationSignal = {
    stagnationScore: 0,
    isStagnant: false,
    windowSize: recentOutputs.length,
    consecutiveSimilarity: [],
    suggestedPersona: "",
    trigger: "none",
  };

  if (recentOutputs.length < 2) return signal;

  const similarities: number[] = [];
  for (let i = 1; i < recentOutputs.length; i++) {
    similarities.push(jaccardSimilarity(recentOutputs[i - 1], recentOutputs[i]));
  }
  signal.consecutiveSimilarity = similarities;

  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const recentAvg = similarities.slice(-Math.min(3, similarities.length)).reduce((a, b) => a + b, 0) / Math.min(3, similarities.length);

  if (recentAvg > STAGNATION_THRESHOLD && similarities.length >= STAGNATION_WINDOW - 1) {
    signal.stagnationScore = recentAvg;
    signal.isStagnant = true;
    signal.trigger = "similarity";
  }

  if (elapsedMs > timeoutMs * 0.8) {
    signal.stagnationScore = Math.max(signal.stagnationScore, 0.7);
    signal.isStagnant = true;
    signal.trigger = "timeout";
  }

  return signal;
}

// ============================================================================
// EXECUTOR REGISTRY & CAPABILITIES
// ============================================================================

function loadExecutors(): Record<string, ExecutorCapability> {
  const executors: Record<string, ExecutorCapability> = {};

  // Load ONLY local executors from persona registry
  try {
    if (existsSync(PERSONA_REGISTRY)) {
      const registry = JSON.parse(readFileSync(PERSONA_REGISTRY, "utf-8"));
      const personas = registry.personas || [];
      for (const p of personas) {
        // Only include if it has executor === "local" AND a bridge
        if (p.executor === "local" && p.bridge) {
          const bridgePath = p.bridge.startsWith("/") ? p.bridge : join(WORKSPACE, p.bridge);
          // Verify the bridge actually exists
          if (existsSync(bridgePath)) {
            executors[p.id] = {
              id: p.id,
              name: p.name || p.id,
              expertise: p.expertise || [],
              bestFor: p.best_for || [],
              isLocal: true,
            };
          }
        }
      }
    }
  } catch {}

  // Enrich from executor registry (also only local executors)
  try {
    if (existsSync(REGISTRY)) {
      const execRegistry = JSON.parse(readFileSync(REGISTRY, "utf-8"));
      for (const ex of execRegistry.executors || []) {
        if (!ex.id) continue;
        // Only include local executors with valid bridges
        if (ex.executor !== "local") continue;
        const bridgePath = ex.bridge ? join(WORKSPACE, ex.bridge) : null;
        if (!bridgePath || !existsSync(bridgePath)) continue;

        const existing = executors[ex.id];
        if (existing) {
          // Merge expertise and best_for
          const mergedExpertise = new Set([...existing.expertise, ...(ex.expertise || [])]);
          const mergedBestFor = new Set([...existing.bestFor, ...(ex.best_for || [])]);
          existing.expertise = [...mergedExpertise];
          existing.bestFor = [...mergedBestFor];
        } else {
          executors[ex.id] = {
            id: ex.id,
            name: ex.name || ex.id,
            expertise: ex.expertise || [],
            bestFor: ex.best_for || [],
            isLocal: true,
          };
        }
      }
    }
  } catch {}

  return executors;
}

function getBridge(exid: string, executors: Record<string, ExecutorCapability>): string | null {
  const ex = executors[exid];
  if (!ex) return null;

  // Try executor-registry bridge path
  try {
    const execRegistry = JSON.parse(readFileSync(REGISTRY, "utf-8"));
    for (const e of execRegistry.executors || []) {
      if (e.id === exid && e.bridge) {
        const p = join(WORKSPACE, e.bridge);
        if (existsSync(p)) return p;
      }
    }
  } catch {}

  // Fallback to persona registry
  try {
    const registry = JSON.parse(readFileSync(PERSONA_REGISTRY, "utf-8"));
    for (const p of registry.personas || []) {
      if (p.id === exid && p.bridge) {
        const bridgePath = p.bridge.startsWith("/") ? p.bridge : join(WORKSPACE, p.bridge);
        if (existsSync(bridgePath)) return bridgePath;
      }
    }
  } catch {}

  // Try workspace root fallback
  const alt = join(WORKSPACE, exid + "-bridge.sh");
  if (existsSync(alt)) return alt;

  return null;
}

// ============================================================================
// AGENCY PERSONA RESOLUTION
// ============================================================================

const personaCache = new Map<string, string>();

function resolveAgencyPersona(personaName: string): string {
  if (personaCache.has(personaName)) {
    return personaCache.get(personaName)!;
  }

  try {
    if (!existsSync(AGENCY_PERSONAS)) return "";

    const index = JSON.parse(readFileSync(AGENCY_PERSONAS, "utf-8"));
    const personas = index.personas || [];

    for (const p of personas) {
      if (p.name === personaName || p.id === personaName) {
        let content = "";
        if (p.system_prompt) {
          content = p.system_prompt;
        } else if (p.prompt_file) {
          const promptPath = join(WORKSPACE, p.prompt_file);
          if (existsSync(promptPath)) {
            content = readFileSync(promptPath, "utf-8");
          }
        }
        personaCache.set(personaName, content);
        return content;
      }
    }
  } catch {}

  return "";
}

function getEffectiveExecutor(task: Task): string {
  return task.executor || task.persona;
}

// ============================================================================
// ROUTING ENGINE
// ============================================================================

function estimateComplexity(task: Task): { tier: ComplexityTier; signals: any } {
  const text = task.task || "";
  const result = estimateComplexitySync(text);
  return {
    tier: result.tier,
    signals: {
      wordCount: result._legacy?.wordCount || 0,
      fileCount: result._legacy?.fileCount || 0,
      hasMultiStep: result._legacy?.hasMultiStep || false,
      hasTool: result._legacy?.hasTool || false,
      hasAnalysis: result._legacy?.hasAnalysis || false,
    },
  };
}

function complexityFitScore(executorId: string, complexity: ComplexityTier): number {
  return COMPLEXITY_AFFINITY[executorId]?.[complexity] ?? 0.5;
}

function capScore(task: Task, ex: ExecutorCapability): number {
  const text = (task.task + " " + (task.memoryMetadata?.category || "")).toLowerCase();
  const kw = [...ex.expertise, ...ex.bestFor].map(k => k.toLowerCase());
  if (kw.length === 0) return 0.5;
  const hits = kw.filter(k => text.includes(k)).length;
  return Math.min(1.0, hits / kw.length);
}

function healthScore(cb: CircuitBreakerV2 | undefined): number {
  if (!cb) return 1.0;
  if (cb.state === "OPEN") return 0.0;
  return Math.max(0.0, 1.0 - cb.failures * 0.3);
}

/**
 * Get historical success rate for executor-category pair
 */
function historyScore(exid: string, cat: string): number {
  try {
    const db = new Database(HISTORY_DB, { readonly: true });
    const row = db.query(
      "SELECT attempts, successes FROM executor_history WHERE executor=? AND category=?",
    ).get(exid, cat || "general") as { attempts: number; successes: number } | null;
    db.close();
    return row && row.attempts >= 3 ? row.successes / row.attempts : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Get recent episodic success rate
 */
function getRecentEpisodicRate(executorId: string, sinceDays: number = 7): number {
  try {
    const db = new Database(MEMORY_DB, { readonly: true });
    const since = Math.floor(Date.now() / 1000) - sinceDays * 24 * 60 * 60;
    const stmt = db.prepare(
      "SELECT outcome FROM episodes WHERE entities LIKE ? AND happened_at > ?"
    );
    const rows = stmt.all(`%executor.${executorId}%`, since) as { outcome: string }[];
    db.close();

    if (rows.length === 0) return 0.5;
    const successes = rows.filter(r => r.outcome === "success").length;
    return successes / rows.length;
  } catch {
    return 0.5;
  }
}

/**
 * Route a task to the best executor based on composite scoring
 */
function route(
  task: Task,
  executors: Record<string, ExecutorCapability>,
  cbs: Map<string, CircuitBreakerV2>,
  strategy: string,
  useSixSignal: boolean
): RouteDecision {
  const complexity = estimateComplexity(task);
  const cat = task.memoryMetadata?.category || "general";


// Get procedure success rate from memory database
function getProcedureSuccessRate(executorId: string, category?: string): number {
  try {
    const db = new Database(MEMORY_DB, { readonly: true });
    const query = category
      ? "SELECT outcome FROM procedures WHERE executor=? AND category=?"
      : "SELECT outcome FROM procedures WHERE executor=?";
    const stmt = db.prepare(query);
    const rows = category
      ? stmt.all(executorId, category) as { outcome: string }[]
      : stmt.all(executorId) as { outcome: string }[];
    db.close();

    if (rows.length === 0) return 0.5;
    const successes = rows.filter(r => r.outcome === "success").length;
    return successes / rows.length;
  } catch {
    return 0.5;
  }
}
  const weights = useSixSignal
    ? STRATEGY_WEIGHTS_6SIGNAL[strategy as keyof typeof STRATEGY_WEIGHTS_6SIGNAL] || STRATEGY_WEIGHTS_6SIGNAL.balanced
    : STRATEGY_WEIGHTS[strategy as keyof typeof STRATEGY_WEIGHTS] || STRATEGY_WEIGHTS.balanced;

  const candidates: Array<{ id: string; name: string; score: number; breakdown: any }> = [];

  for (const [eid, ex] of Object.entries(executors)) {
    const cap = capScore(task, ex);
    const hl = healthScore(cbs.get(eid));
    const cf = complexityFitScore(eid, complexity.tier);
    const hi = historyScore(eid, cat);

    let score: number;
    let breakdown: any;

    if (useSixSignal) {
      const proc = getProcedureSuccessRate(eid, cat);
      const temp = getRecentEpisodicRate(eid, 7);
      score = weights.capability * cap + weights.health * hl + weights.complexityFit * cf +
              weights.history * hi + (weights as any).procedure * proc + (weights as any).temporal * temp;
      breakdown = { capability: cap, health: hl, complexityFit: cf, history: hi, procedure: proc, temporal: temp };
    } else {
      score = weights.capability * cap + weights.health * hl + weights.complexityFit * cf + weights.history * hi;
      breakdown = { capability: cap, health: hl, complexityFit: cf, history: hi };
    }

    candidates.push({ id: eid, name: ex.name, score, breakdown });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const top3 = candidates.slice(0, 3);

  console.log(
    `  [route:${complexity.tier}] ` +
    top3.map(c => `${c.id}(${c.score.toFixed(2)})`).join(" vs ") +
    ` -> ${top.id}`
  );

  return {
    executorId: top.id,
    executorName: top.name,
    compositeScore: top.score,
    breakdown: top.breakdown,
    method: "composite",
  };
}

// ============================================================================
// OMNIRoute INTEGRATION (Stubs for extended routing)
// ============================================================================

/**
 * Fetch available combos (stub for external combo service)
 */
async function fetchCombos(): Promise<any[]> {
  // In production, this would call the combo listing endpoint
  // For now, return empty to use static fallback
  return [];
}

/**
 * Select best combo for a task based on characteristics (stub)
 */
async function bestComboForTask(
  task: string,
  combos: any[],
  options: { taskType: any; constraints: { latency: string; quality: string } }
): Promise<{ comboId: string | null; confidence: number }> {
  // In production, use the external recommendation API
  // For now, return empty to use static fallback
  return { comboId: null, confidence: 0 };
}

// ============================================================================
// MEMORY MANAGER (Corrected for actual interfaces)
// ============================================================================

class MemoryManager {
  private swarmId: string;
  private config: OrchestratorConfig;
  private swarmMemory: SwarmMemory | null = null;
  private hierarchical: HierarchicalMemory | null = null;
  private sliding: SlidingWindowMemory | null = null;
  private contextIds: string[] = [];

  constructor(swarmId: string, config: OrchestratorConfig) {
    this.swarmId = swarmId;
    this.config = config;

    if (config.enableMemory) {
      this.swarmMemory = getSwarmMemory(config.memoryDbPath);

      if (config.defaultMemoryStrategy === "hierarchical") {
        this.hierarchical = new HierarchicalMemory({ maxTokens: config.maxContextTokens });
      } else if (config.defaultMemoryStrategy === "sliding") {
        this.sliding = new SlidingWindowMemory(config.maxContextTokens, 0.7);
      }
    }
  }

  getContext(task: Task): string {
    if (!this.config.enableMemory || !this.swarmMemory) return "";

    // Query relevant contexts
    const query: MemoryQuery = {
      swarmId: this.swarmId,
      category: task.memoryMetadata?.category,
      priority: task.memoryMetadata?.priority,
      limit: this.config.crossTaskContextWindow,
    };

    const contexts = this.swarmMemory.queryContexts(query);
    if (contexts.length === 0) return "";

    // Build context string
    const contextStr = contexts.map(ctx => ctx.content).join("\n\n---\n\n");

    // Apply memory strategy
    if (this.hierarchical) {
      this.hierarchical.add({
        content: contextStr,
        metadata: {
          sourceAgent: "swarm_memory",
          category: task.memoryMetadata?.category,
          priority: task.memoryMetadata?.priority,
        },
      });
      return this.hierarchical.getContextString();
    }

    if (this.sliding) {
      // SlidingWindowMemory stores items internally
      return `## Prior Context\n\n${contextStr.slice(0, this.config.maxContextTokens * 4)}`;
    }

    return contextStr;
  }

  addAgentOutput(persona: string, output: string, metadata: any): void {
    if (!this.swarmMemory) return;

    const context = this.swarmMemory.writeContext(this.swarmId, output, {
      category: metadata?.category,
      priority: metadata?.priority,
      sourceAgent: persona,
      tags: metadata?.tags,
    });

    this.contextIds.push(context.id);
  }

  getStats(): any {
    if (!this.swarmMemory) return null;
    return { contexts: this.contextIds.length };
  }
}

// ============================================================================
// NDJSON LOGGER
// ============================================================================

class NdjsonLogger {
  private logPath: string;
  private buffer: any[] = [];
  private flushInterval: any;

  constructor(swarmId: string) {
    this.logPath = join(LOGS_DIR, `${swarmId}.ndjson`);
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  log(event: string, data: Record<string, unknown>): void {
    this.buffer.push({
      ts: new Date().toISOString(),
      event,
      ...data,
    });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.map(e => JSON.stringify(e)).join("\n") + "\n";
    try {
      writeFileSync(this.logPath, lines, { flag: "a" });
      this.buffer = [];
    } catch {}
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

class SwarmOrchestrator {
  private config: OrchestratorConfig;
  private memoryManager: MemoryManager | null = null;
  private swarmId: string;
  private sessionId: string;
  private circuitBreakers: Map<string, CircuitBreakerV2> = new Map();
  private backpressureStates: Map<string, BackpressureState> = new Map();
  private results: TaskResult[] = [];
  private completedOutputs: Array<{ executor: string; category: string; summary: string }> = [];
  private logger: NdjsonLogger;
  private executors: Record<string, ExecutorCapability> = {};
  private localExecutors: Map<string, LocalExecutor> = new Map();
  private progressFile: string;
  private runStartTime: number = 0;
  private totalTaskCount: number = 0;
  private apiFallbackHealth: ApiFallbackHealthState = {
    circuitOpen: false,
    consecutiveFailures: 0,
    lastFailure: 0,
    budgetUsedTokens: 0,
  };

  constructor(swarmId: string, config: Partial<OrchestratorConfig> = {}) {
    this.swarmId = swarmId;
    this.sessionId = `${swarmId}_${Date.now()}`;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new NdjsonLogger(swarmId);
    this.progressFile = join(LOCK_DIR, `${swarmId}-progress.json`);

    if (this.config.enableMemory) {
      this.memoryManager = new MemoryManager(swarmId, this.config);
    }

    this.loadExecutors();
    this.loadCircuitBreakerState();
  }

  private loadExecutors(): void {
    this.executors = loadExecutors();

    // Load local executor bridges
    try {
      if (existsSync(PERSONA_REGISTRY)) {
        const registry = JSON.parse(readFileSync(PERSONA_REGISTRY, "utf-8"));
        for (const p of registry.personas || []) {
          if (p.executor === "local" && p.bridge) {
            const bridgePath = p.bridge.startsWith("/") ? p.bridge : join(WORKSPACE, p.bridge);
            if (existsSync(bridgePath)) {
              this.localExecutors.set(p.id, { id: p.id, bridge: bridgePath, name: p.name || p.id });
            }
          }
        }
      }
    } catch {}

    // Also try executor registry
    try {
      if (existsSync(REGISTRY)) {
        const execRegistry = JSON.parse(readFileSync(REGISTRY, "utf-8"));
        for (const ex of execRegistry.executors || []) {
          if (ex.executor === "local" && ex.bridge) {
            const bridgePath = join(WORKSPACE, ex.bridge);
            if (existsSync(bridgePath)) {
              this.localExecutors.set(ex.id, { id: ex.id, bridge: bridgePath, name: ex.name || ex.id });
            }
          }
        }
      }
    } catch {}

    console.log(`\nLocal executors: ${[...this.localExecutors.keys()].join(", ") || "none"}`);
  }

  private loadCircuitBreakerState(): void {
    try {
      if (existsSync(CIRCUIT_STATE_FILE)) {
        const data = JSON.parse(readFileSync(CIRCUIT_STATE_FILE, "utf-8"));
        const { breakers, backpressure } = deserializeCircuitBreakers(data);
        this.circuitBreakers = breakers;
        this.backpressureStates = backpressure;
      }
    } catch {}
  }

  private saveCircuitBreakerState(): void {
    try {
      const data = serializeCircuitBreakers(this.circuitBreakers, this.backpressureStates);
      writeFileSync(CIRCUIT_STATE_FILE, JSON.stringify(data, null, 2));
    } catch {}
  }

  private writeProgress(extra: Record<string, unknown> = {}): void {
    try {
      const successful = this.results.filter(r => r.success).length;
      const failed = this.results.filter(r => !r.success).length;
      const progress: ProgressData = {
        ts: new Date().toISOString(),
        swarmId: this.swarmId,
        totalTasks: this.totalTaskCount,
        completed: successful,
        failed,
        percentComplete: this.totalTaskCount > 0 ? Math.round(((successful + failed) / this.totalTaskCount) * 100) : 0,
        elapsedMs: Date.now() - this.runStartTime,
        status: "running",
        ...extra,
      };
      writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
    } catch {}
  }

  // --------------------------------------------------------------------------
  // PREFLIGHT VALIDATION
  // --------------------------------------------------------------------------

  private async preflight(tasks: Task[]): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate task structure
    for (const task of tasks) {
      const effectiveExec = getEffectiveExecutor(task);
      if (!task.id || !effectiveExec || !task.task) {
        errors.push(`Invalid task: missing required fields (id=${task.id}, executor=${effectiveExec})`);
      }
    }

    // Check for duplicates
    const ids = tasks.map(t => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      errors.push(`Duplicate task IDs: ${[...new Set(dupes)].join(", ")}`);
    }

    // Run health checks from executor registry — remove unhealthy executors
    try {
      if (existsSync(REGISTRY)) {
        const execRegistry = JSON.parse(readFileSync(REGISTRY, "utf-8"));
        for (const ex of execRegistry.executors || []) {
          if (!ex.id || !ex.healthCheck?.command) continue;
          if (!this.executors[ex.id]) continue; // not loaded, skip
          try {
            const hc = spawnSync("bash", ["-c", ex.healthCheck.command], {
              timeout: 5000,
              stdio: ["ignore", "pipe", "pipe"],
            });
            if (hc.status !== 0) {
              console.log(`  ⚠ Executor "${ex.id}" failed health check: ${ex.healthCheck.description || ex.healthCheck.command}`);
              delete this.executors[ex.id];
            }
          } catch {
            console.log(`  ⚠ Executor "${ex.id}" health check timed out`);
            delete this.executors[ex.id];
          }
        }
      }
    } catch {}

    // Check that at least one executor is available after health checks
    const availableExecutors = Object.keys(this.executors);
    if (availableExecutors.length === 0) {
      errors.push("No healthy executors available — all failed health checks");
    }

    // Warn about tasks assigned to unavailable executors (reroute handles at runtime)
    const unavailableAssignments = new Set<string>();
    for (const task of tasks) {
      const effectiveExec = getEffectiveExecutor(task);
      if (effectiveExec === "auto") continue;
      if (!this.executors[effectiveExec]) {
        unavailableAssignments.add(effectiveExec);
      }
    }
    if (unavailableAssignments.size > 0 && availableExecutors.length > 0) {
      console.log(`  ⚠ Executor(s) not available: ${[...unavailableAssignments].join(", ")} — tasks will be rerouted to [${availableExecutors.join(", ")}]`);
    }

    // Verify DAG dependencies
    const taskIds = new Set(tasks.map(t => t.id));
    for (const task of tasks) {
      for (const dep of task.dependsOn || []) {
        if (!taskIds.has(dep)) {
          errors.push(`Task ${task.id} depends on unknown task: ${dep}`);
        }
      }
    }

    // Check for cycles
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const hasCycle = (id: string): boolean => {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      inStack.add(id);
      const task = taskMap.get(id);
      for (const dep of task?.dependsOn || []) {
        if (hasCycle(dep)) return true;
      }
      inStack.delete(id);
      return false;
    };
    for (const task of tasks) {
      visited.clear();
      inStack.clear();
      if (hasCycle(task.id)) {
        errors.push(`Dependency cycle detected involving task: ${task.id}`);
        break;
      }
    }

    // Check memory system
    if (this.config.enableMemory && this.memoryManager) {
      try {
        const stats = this.memoryManager.getStats();
        if (!stats) {
          errors.push("Memory system returned null stats");
        }
      } catch (e) {
        errors.push(`Memory system error: ${e}`);
      }
    }


    return { ok: errors.length === 0, errors };
  }

  // --------------------------------------------------------------------------
  // MAIN EXECUTION
  // --------------------------------------------------------------------------

  async run(tasks: Task[]): Promise<TaskResult[]> {
    const startTime = Date.now();
    this.runStartTime = startTime;
    this.totalTaskCount = tasks.length;

    console.log(`\n🚀 Swarm ${this.swarmId} v5.0.0`);
    const availableIds = Object.keys(this.executors);
    console.log(`   Tasks: ${tasks.length} | Concurrency: ${this.config.localConcurrency} | Strategy: ${this.config.routingStrategy}`);
    console.log(`   Executors: ${availableIds.length} available [${availableIds.join(", ")}]`);

    // Campaign locking
    const lockPath = join(LOCK_DIR, `${this.swarmId}.lock`);
    const STALE_LOCK_MS = 30 * 60 * 1000;
    if (existsSync(lockPath)) {
      try {
        const lock = JSON.parse(readFileSync(lockPath, "utf8"));
        if (Date.now() - lock.ts < STALE_LOCK_MS) {
          console.log(`   ❌ Swarm ${this.swarmId} is already running (PID: ${lock.pid})`);
          return [];
        }
      } catch {}
    }
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }));

    // Pre-flight
    const preflight = await this.preflight(tasks);
    if (!preflight.ok) {
      console.log("   ❌ Pre-flight failed:");
      for (const err of preflight.errors) console.log(`      - ${err}`);
      unlinkSync(lockPath);
      return [];
    }

    console.log("   ✓ Pre-flight passed\n");

    // Execute based on DAG mode
    if (this.config.dagMode === "waves") {
      await this.runDAGWaves(tasks);
    } else {
      await this.runDAGStreaming(tasks);
    }

    const totalDuration = Date.now() - startTime;
    await this.saveResults(totalDuration);
    await this.printSummary(totalDuration);
    await this.sendCompletionNotification(totalDuration);

    this.saveCircuitBreakerState();

    try { unlinkSync(lockPath); } catch {}
    await this.logger.close();

    return this.results;
  }

  // --------------------------------------------------------------------------
  // DAG STREAMING EXECUTION (v5.2 - Cascade Mitigation)
  // --------------------------------------------------------------------------

  private async runDAGStreaming(tasks: Task[]): Promise<void> {
    const pending = new Map(tasks.map(t => [t.id, t]));
    const running = new Map<string, Promise<void>>();
    const completed = new Set<string>();
    const failed = new Set<string>();
    const failedRoots = new Set<string>();
    const taskResults = new Map<string, TaskResult>();
    
    // Track which tasks are running in degraded mode
    const degradedTasks = new Set<string>();
    
    // Default policy from config (abort = skip downstream, degrade = proceed with partial)
    const defaultPolicy: DependencyFailurePolicy = this.config.cascadeMode ? "abort" : "degrade";

    while (pending.size > 0 || running.size > 0) {
      // Start new tasks
      while (running.size < this.config.localConcurrency && pending.size > 0) {
        let started = false;
        for (const [id, task] of pending) {
          if (canRun(task)) {
            pending.delete(id);
            const deps = task.dependsOn || [];
            
            // Check for failed dependencies
            const failedDeps = deps.filter(d => failed.has(d));
            
            if (failedDeps.length > 0) {
              // Determine policy
              const policy = resolvePolicy(task, defaultPolicy);
              const taskType = classifyTaskType(task);
              
              // Log cascade event
              logCascadeEvent({
                swarmId: this.swarmId,
                taskId: id,
                eventType: "dependency_failed",
                failedDependencyId: failedDeps[0],
                policy,
                taskType,
                completedDeps: deps.filter(d => completed.has(d)),
                failedDeps,
                degraded: false,
                timestamp: Date.now(),
              });
              
              if (policy === "abort" || (policy === "degrade" && taskType === "mutation")) {
                // Skip this task
                console.log(`  SKIP [${id}] (failed deps: ${failedDeps.join(", ")}, policy: ${policy})`);
                failed.add(id);
                completed.add(id);
                started = true;
                continue;
              }
              
              if (policy === "degrade") {
                // Mark for degraded execution
                console.log(`  DEGRADE [${id}] (proceeding with partial inputs)`);
                degradedTasks.add(id);
              }
              
              if (policy === "retry") {
                // Check if failed deps have retry attempts left
                const canRetryDeps = failedDeps.some(d => {
                  const result = taskResults.get(d);
                  return result && result.retries < (result.task.maxRetriesOnDegraded ?? this.config.maxRetries);
                });
                
                if (!canRetryDeps) {
                  console.log(`  SKIP [${id}] (retry exhausted for deps: ${failedDeps.join(", ")})`);
                  failed.add(id);
                  completed.add(id);
                  started = true;
                  continue;
                }
                
                // Put back in pending to wait for retry
                pending.set(id, task);
                started = true;
                continue;
              }
            }

            const promise = this.executeTaskWithResilience(task, degradedTasks.has(id) ? taskResults : undefined)
              .then(result => {
                this.results.push(result);
                taskResults.set(id, result);
                
                if (result.success) {
                  completed.add(id);
                  
                  // Log degraded execution success
                  if (degradedTasks.has(id)) {
                    logCascadeEvent({
                      swarmId: this.swarmId,
                      taskId: id,
                      eventType: "degraded_execution",
                      failedDependencyId: "",
                      policy: "degrade",
                      taskType: classifyTaskType(task),
                      completedDeps: [],
                      failedDeps: [],
                      degraded: true,
                      timestamp: Date.now(),
                    });
                  }
                } else {
                  failed.add(id);
                  if ((task.dependsOn || []).length === 0) {
                    failedRoots.add(id);
                  }
                }
                running.delete(id);
                this.writeProgress();
              });
            running.set(id, promise);
            started = true;
            break;
          }
        }
        if (!started) break;
      }

      // Wait for at least one task to complete
      if (running.size > 0) {
        await Promise.race(running.values());
      }

      await new Promise(r => setTimeout(r, 100));
    }
    
    // Log cascade completion summary
    if (degradedTasks.size > 0) {
      logCascadeEvent({
        swarmId: this.swarmId,
        taskId: "summary",
        eventType: "cascade_complete",
        failedDependencyId: "",
        policy: "degrade",
        taskType: "analysis",
        completedDeps: [...completed],
        failedDeps: [...failed],
        degraded: true,
        timestamp: Date.now(),
      });
    }
  }

  // --------------------------------------------------------------------------
  // DAG WAVES EXECUTION (v5.2 - Cascade Mitigation)
  // --------------------------------------------------------------------------

  private async runDAGWaves(tasks: Task[]): Promise<void> {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const remaining = new Set(tasks.map(t => t.id));
    const completed = new Set<string>();
    const failed = new Set<string>();
    const failedRoots = new Set<string>();
    const taskResults = new Map<string, TaskResult>();
    const degradedTasks = new Set<string>();
    
    const defaultPolicy: DependencyFailurePolicy = this.config.cascadeMode ? "abort" : "degrade";

    let wave = 0;
    while (remaining.size > 0) {
      wave++;
      const waveTasks: Task[] = [];

      for (const id of remaining) {
        const task = taskMap.get(id)!;
        const deps = task.dependsOn || [];
        const depsMet = deps.every(d => completed.has(d) || failed.has(d));

        if (depsMet) {
          const failedDeps = deps.filter(d => failed.has(d));
          
          if (failedDeps.length > 0) {
            const policy = resolvePolicy(task, defaultPolicy);
            const taskType = classifyTaskType(task);
            
            // Log cascade event
            logCascadeEvent({
              swarmId: this.swarmId,
              taskId: id,
              eventType: "dependency_failed",
              failedDependencyId: failedDeps[0],
              policy,
              taskType,
              completedDeps: deps.filter(d => completed.has(d)),
              failedDeps,
              degraded: false,
              timestamp: Date.now(),
            });
            
            if (policy === "abort" || (policy === "degrade" && taskType === "mutation")) {
              console.log(`  SKIP [${id}] (failed deps: ${failedDeps.join(", ")}, policy: ${policy})`);
              failed.add(id);
              remaining.delete(id);
              continue;
            }
            
            if (policy === "degrade") {
              console.log(`  DEGRADE [${id}] (proceeding with partial inputs)`);
              degradedTasks.add(id);
            }
            
            if (policy === "retry") {
              const canRetryDeps = failedDeps.some(d => {
                const result = taskResults.get(d);
                return result && result.retries < (result.task.maxRetriesOnDegraded ?? this.config.maxRetries);
              });
              
              if (!canRetryDeps) {
                console.log(`  SKIP [${id}] (retry exhausted)`);
                failed.add(id);
                remaining.delete(id);
                continue;
              }
              
              // Skip for now, will be retried
              continue;
            }
          }
          
          waveTasks.push(task);
        }
      }

      if (waveTasks.length === 0) {
        if (remaining.size > 0) {
          console.log(`  ⚠️  Deadlock detected: ${remaining.size} tasks remain but none can run`);
          for (const id of remaining) {
            failed.add(id);
          }
        }
        break;
      }

      console.log(`\n📊 Wave ${wave}: ${waveTasks.length} tasks${degradedTasks.size > 0 ? ` (${degradedTasks.size} degraded)` : ""}`);

      // Execute wave in parallel
      const waveResults = await Promise.all(
        waveTasks.map(t => this.executeTaskWithResilience(t, degradedTasks.has(t.id) ? taskResults : undefined))
      );

      for (const result of waveResults) {
        this.results.push(result);
        taskResults.set(result.task.id, result);
        remaining.delete(result.task.id);
        
        if (result.success) {
          completed.add(result.task.id);
        } else {
          failed.add(result.task.id);
          if ((result.task.dependsOn || []).length === 0) {
            failedRoots.add(result.task.id);
          }
        }
      }

      this.writeProgress();
    }
    
    // Log cascade completion
    if (degradedTasks.size > 0) {
      logCascadeEvent({
        swarmId: this.swarmId,
        taskId: "summary",
        eventType: "cascade_complete",
        failedDependencyId: "",
        policy: "degrade",
        taskType: "analysis",
        completedDeps: [...completed],
        failedDeps: [...failed],
        degraded: true,
        timestamp: Date.now(),
      });
    }
  }

  // --------------------------------------------------------------------------
  // TASK EXECUTION WITH RESILIENCE (v5.2 - Cascade Mitigation)
  // --------------------------------------------------------------------------

  private async executeTaskWithResilience(task: Task, taskResults?: Map<string, TaskResult>): Promise<TaskResult> {
    const startTime = Date.now();
    const originalAssignment = { persona: task.persona, executor: task.executor };
    const cat = task.memoryMetadata?.category || "general";

    // Check if this is degraded execution
    const isDegraded = taskResults !== undefined && (task.dependsOn || []).some(d => {
      const r = taskResults.get(d);
      return r && !r.success;
    });

    let retries = 0;
    const tried = new Set<string>();
    let recentOutputs: string[] = [];

    // Resolve assigned executor — task.executor takes priority, falls back to task.persona
    const assignedExec = getEffectiveExecutor(task);

    // Get or create circuit breaker
    if (!this.circuitBreakers.has(assignedExec)) {
      this.circuitBreakers.set(assignedExec, createDefaultCircuitBreaker());
    }
    const cb = this.circuitBreakers.get(assignedExec)!;

    // Get or create backpressure state
    if (!this.backpressureStates.has(assignedExec)) {
      this.backpressureStates.set(assignedExec, createDefaultBackpressure(assignedExec));
    }
    const bp = this.backpressureStates.get(assignedExec)!;

    while (retries <= this.config.maxRetries) {
      // Check circuit breaker
      if (!canAttempt(cb)) {
        console.log(`  ⏏️  [${task.id}] Circuit OPEN for ${assignedExec}, waiting...`);
        await new Promise(r => setTimeout(r, cb.cooldownMs));
        continue;
      }

      // Route to executor — use assigned executor on first try if available, else auto-route
      let exid: string;
      if (assignedExec !== "auto" && retries === 0 && this.executors[assignedExec]) {
        exid = assignedExec;
      } else {
        const decision = route(task, this.executors, this.circuitBreakers, this.config.routingStrategy, this.config.useSixSignalRouting);
        exid = decision.executorId;

        // Retry-with-reroute: try different executor on retry
        if (tried.has(exid) && tried.size < Object.keys(this.executors).length) {
          const alternatives = Object.keys(this.executors).filter(e => !tried.has(e));
          if (alternatives.length > 0) {
            exid = alternatives[0];
            console.log(`  🔄 [${task.id}] Rerouting to ${exid}`);
          }
        }
      }

      tried.add(exid);

      const bridge = getBridge(exid, this.executors);
      if (!bridge) {
        // Bridge missing — treat as retriable so routing selects a different executor
        const err = `Bridge missing for executor: ${exid}`;
        console.log(`  ⚠️  [${task.id}] ${err} — rerouting to next executor`);
        this.logger.log("task_error", { taskId: task.id, executor: exid, attempt: retries, errorType: "bridge_missing", retryable: true });
        recordFailure(cb, "runtime_error");
        recordHistory(exid, cat, false, 0);
        recentOutputs.push(err);
        retries++;
        if (retries <= this.config.maxRetries) {
          const wait = Math.pow(2, retries - 1) * 1000;
          console.log(`  ⏳ [${task.id}] Retrying with different executor in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          continue; // retry with a different executor via the reroute logic
        } else {
          return { task, success: false, error: err, durationMs: Date.now() - startTime, retries };
        }
      }

      const timeout = task.timeoutSeconds || this.config.timeoutSeconds;

      // Build optimized prompt (with partial inputs if degraded)
      const prompt = await this.buildOptimizedPrompt(task, exid, retries > 0 ? recentOutputs : [], isDegraded ? taskResults : undefined);

      // Add degraded execution notice to prompt if applicable
      let finalPrompt = prompt;
      if (isDegraded && taskResults) {
        const partialContext = assemblePartialInputs(task, new Set(), new Set(
          (task.dependsOn || []).filter(d => {
            const r = taskResults.get(d);
            return r && !r.success;
          })
        ), taskResults);
        
        if (partialContext.warningAnnotation) {
          finalPrompt = partialContext.warningAnnotation + "\n\n" + prompt;
        }
      }

      console.log(`  ▶️  [${task.id}] ${exid}${isDegraded ? " (degraded)" : ""} (attempt ${retries + 1}/${this.config.maxRetries + 1})`);

      const t0 = Date.now();
      try {
        const output = await this.callLocalAgent(exid, bridge, finalPrompt, timeout);
        const duration = Date.now() - t0;

        // Update circuit breaker and backpressure
        recordSuccess(cb);
        updateBackpressure(bp, duration);

        // Record history
        recordHistory(exid, cat, true, duration);

        // Add to memory
        if (this.memoryManager) {
          this.memoryManager.addAgentOutput(exid, output, { ...task.memoryMetadata, outputToMemory: task.outputToMemory });
        }

        // Update completed outputs for cross-task context
        this.completedOutputs.push({ executor: exid, category: cat, summary: output.slice(0, 300) });

        // Restore original task assignment
        task.persona = originalAssignment.persona;
        task.executor = originalAssignment.executor;

        this.logger.log("task_success", { taskId: task.id, executor: exid, durationMs: duration });

        return { task, success: true, output, durationMs: duration, retries };

      } catch (error) {
        const duration = Date.now() - t0;
        const errorStr = String(error);
        const classified = classifyError(errorStr);

        // Update circuit breaker
        recordFailure(cb, classified.type);
        updateBackpressure(bp, duration * 2); // Penalize failures

        // Record history
        recordHistory(exid, cat, false, duration);

        recentOutputs.push(errorStr);

        console.log(`  ⚠️  [${task.id}] ${exid} failed (${classified.type}): ${errorStr.slice(0, 80)}`);
        this.logger.log("task_error", {
          taskId: task.id,
          executor: exid,
          attempt: retries,
          errorType: classified.type,
          retryable: classified.retryable,
        });

        // Store previous attempt context for retry
        if (!task.memoryMetadata) task.memoryMetadata = {};
        task.memoryMetadata.previousAttemptContext = {
          previous_executor: exid,
          error_type: classified.type,
          error: errorStr.slice(0, 500),
          suggested_action: classified.suggestedAction,
        };

        retries++;

        if (retries <= this.config.maxRetries && classified.retryable) {
          const wait = Math.pow(2, retries - 1) * 1000;
          console.log(`  ⏳ [${task.id}] Retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
        } else if (!classified.retryable) {
          break;
        }
      }
    }

    task.persona = originalAssignment.persona;
    task.executor = originalAssignment.executor;

    return {
      task,
      success: false,
      error: "Max retries exceeded",
      durationMs: Date.now() - startTime,
      retries,
    };
  }

  // --------------------------------------------------------------------------
  // PROMPT BUILDING
  // --------------------------------------------------------------------------

  private async buildOptimizedPrompt(task: Task, executorId: string, recentOutputs: string[], taskResults?: Map<string, TaskResult>): Promise<string> {
    const basePrompt = task.task || "";

    // v5.1: RAG enrichment — auto-inject relevant SDK patterns
    let ragContext = "";
    let ragPatterns = 0;
    if (shouldEnrichWithRAG(basePrompt)) {
      const { context, latencyMs, patterns } = await enrichTaskWithRAG(basePrompt, { topK: 3 });
      ragContext = context;
      ragPatterns = patterns;
      this.logger.log("rag_enrichment", { taskId: task.id, patterns, latencyMs });
    }

    // Resolve agency persona
    let personaContext = "";
    if (task.agencyPersona) {
      const personaMd = resolveAgencyPersona(task.agencyPersona);
      if (personaMd) {
        personaContext = `<persona>\n${personaMd}\n</persona>\n\n` +
          `You are acting as the "${task.agencyPersona}" persona. ` +
          `Follow the identity, rules, and deliverable formats defined above.\n`;
      }
    }

    // Get memory context
    const memoryContext = this.memoryManager?.getContext(task) || "";

    // Build cross-task context
    let crossTaskContext = "";
    if (this.completedOutputs.length > 0) {
      const isSynthesis = task.memoryMetadata?.category === "synthesis" ||
        task.id.toLowerCase().includes("synthesis") ||
        executorId.toLowerCase().includes("manager");

      const window = isSynthesis
        ? this.completedOutputs
        : this.completedOutputs.slice(-this.config.crossTaskContextWindow);

      const entries = window.map(o => `### ${o.executor} (${o.category}):\n${o.summary}`).join("\n\n");
      crossTaskContext = `## Prior Specialist Findings (${window.length})\n${entries}`;
    }

    // Failure context from previous attempts
    let failureContext = "";
    if (task.memoryMetadata?.previousAttemptContext) {
      const prev = task.memoryMetadata.previousAttemptContext;
      failureContext = `<previous-attempt-context>
Previous attempt by "${prev.previous_executor}" failed with: ${prev.error_type}
Error: ${prev.error.slice(0, 300)}
Suggestion: ${prev.suggested_action}
</previous-attempt-context>\n\n`;
    }

    // Stagnation advisory
    let unstuckAdvisory = "";
    if (recentOutputs.length > 0 && this.config.stagnationEnabled) {
      const stagnation = detectStagnation(recentOutputs, task, 0, (task.timeoutSeconds || this.config.timeoutSeconds) * 1000);
      if (stagnation.isStagnant && this.config.autoUnstuckMode !== "log") {
        unstuckAdvisory = `<unstuck-advisory>
Stagnation detected (score: ${stagnation.stagnationScore.toFixed(2)}).
Consider approaching this as a "${stagnation.suggestedPersona}" would.
</unstuck-advisory>\n\n`;
      }
    }

    // Assemble prompt
    let fullPrompt = "";
    if (personaContext) fullPrompt += personaContext + "\n";
    if (failureContext) fullPrompt += failureContext;
    if (unstuckAdvisory) fullPrompt += unstuckAdvisory;
    if (memoryContext) fullPrompt += memoryContext + "\n\n";
    if (crossTaskContext) fullPrompt += crossTaskContext + "\n\n";
    if (ragContext) fullPrompt += ragContext + "\n\n";

    fullPrompt += `## Your Task\n\n${basePrompt}`;

    // Token budget check
    const estimatedTokens = estimateTokens(fullPrompt);
    if (estimatedTokens > this.config.maxContextTokens * 0.9) {
      console.log(`  [${task.id}] Prompt exceeds token budget (${estimatedTokens}), truncating...`);

      // Truncate cross-task context first
      if (crossTaskContext && estimatedTokens > this.config.maxContextTokens) {
        const reduced = this.completedOutputs.slice(-Math.max(1, this.config.crossTaskContextWindow - 1));
        const truncated = `## Prior Specialist Findings (${reduced.length}, trimmed)\n` +
          reduced.map(o => `### ${o.executor} (${o.category}):\n${o.summary.slice(0, 200)}`).join("\n\n");
        fullPrompt = (memoryContext ? memoryContext + "\n\n" : "") + truncated + `\n\n## Your Task\n\n${basePrompt}`;
      }

      // Still over? Truncate memory
      const stillOver = estimateTokens(fullPrompt);
      if (stillOver > this.config.maxContextTokens * 0.9 && memoryContext) {
        const budgetExcess = stillOver - (this.config.maxContextTokens * 0.8);
        const truncatedMemory = truncateToBudget(memoryContext, memoryContext.length - Math.ceil(budgetExcess * 4));
        fullPrompt = truncatedMemory + "\n\n" + `## Your Task\n\n${basePrompt}`;
      }
    }

    // Mutation requirements
    if (task.expectedMutations && task.expectedMutations.length > 0) {
      const mutationList = task.expectedMutations.map(m => `- ${m.file} (must contain: "${m.contains}")`).join("\n");
      fullPrompt += `\n\nREQUIRED CHANGES:\n${mutationList}\nYou must modify these files using your file editing tools.`;
    }

    return fullPrompt;
  }

  // --------------------------------------------------------------------------
  // AGENT COMMUNICATION
  // --------------------------------------------------------------------------

  private async callLocalAgent(executorId: string, bridge: string, prompt: string, timeoutSeconds: number): Promise<string> {
    const timeoutMs = timeoutSeconds * 1000;

    const resultFileName = `result-${randomUUID()}.json`;
    const resultFilePath = join("/tmp", resultFileName);

    try { unlinkSync(resultFilePath); } catch {}

    const env: Record<string, string | undefined> = {
      ...process.env,
      RESULT_PATH: resultFilePath,
      SWARM_TASK_ID: executorId,
      WORKSPACE,
      HOME,
    };

    const proc = spawn("bash", [bridge, prompt], { env });

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timeoutId: any;

      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });

      timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`Timeout after ${timeoutSeconds}s`));
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timeoutId);

        // Try structured result first
        try {
          if (existsSync(resultFilePath)) {
            const content = readFileSync(resultFilePath, "utf-8");
            const structured = JSON.parse(content);
            if (structured.output !== undefined) {
              resolve(structured.output);
              return;
            }
          }
        } catch {}

        if (code === 0) {
          resolve(stdout.trim() || "OK");
        } else {
          reject(new Error(stderr || `Exit code ${code}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }


  // --------------------------------------------------------------------------
  // RESULTS & NOTIFICATIONS
  // --------------------------------------------------------------------------

  private async saveResults(totalDurationMs: number): Promise<void> {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    const results = {
      swarmId: this.swarmId,
      status: "complete",
      cascadeMode: this.config.cascadeMode,
      completed: successful,
      failed,
      total: this.results.length,
      elapsedMs: totalDurationMs,
      results: this.results,
    };

    const resultsPath = join(RESULTS_DIR, `${this.swarmId}.json`);
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    // Create episode
    this.createEpisode(successful, failed, totalDurationMs);
  }

  private createEpisode(successful: number, failed: number, durationMs: number): void {
    try {
      if (!existsSync(MEMORY_DB)) return;

      const db = new Database(MEMORY_DB);
      db.run(`CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY, summary TEXT, outcome TEXT,
        happened_at INTEGER, entities TEXT, metadata TEXT)`);

      const outcome = failed === 0 ? "success" : failed < successful ? "partial" : "failure";
      const summary = `Swarm ${this.swarmId}: ${successful} succeeded, ${failed} failed in ${Math.round(durationMs / 1000)}s`;
      const executorIds = [...this.localExecutors.keys()];

      db.run(
        `INSERT INTO episodes (summary,outcome,happened_at,entities,metadata)
         VALUES (?,?,?,?,?)`,
        [
          summary,
          outcome,
          Math.floor(Date.now() / 1000),
          JSON.stringify(executorIds.map(e => `executor.${e}`)),
          JSON.stringify({ swarm_id: this.swarmId, tasks: this.results.length, succeeded: successful, failed, elapsed_ms: durationMs }),
        ]
      );
      db.close();
    } catch {}
  }

  private async printSummary(totalDurationMs: number): Promise<void> {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const message = `Swarm ${this.swarmId} complete: ${successful}/${this.results.length} tasks in ${Math.round(totalDurationMs / 1000)}s`;

    console.log("\n" + "=".repeat(60));
    console.log(`📊 Swarm ${this.swarmId} Summary`);
    console.log("=".repeat(60));
    console.log(`   Total tasks: ${this.results.length}`);
    console.log(`   Successful:  ${successful} ✅`);
    console.log(`   Failed:      ${failed} ${failed > 0 ? "❌" : ""}`);
    console.log(`   Duration:    ${Math.round(totalDurationMs / 1000)}s`);
    console.log(`   Results:     ${join(RESULTS_DIR, `${this.swarmId}.json`)}`);
    console.log("=".repeat(60));
  }

  private async sendCompletionNotification(totalDurationMs: number): Promise<void> {
    if (this.config.notifyOnComplete === "none") return;

    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const message = `Swarm ${this.swarmId} complete: ${successful}/${this.results.length} tasks in ${Math.round(totalDurationMs / 1000)}s`;

    // This would integrate with Zo notification system
    // For now, just log it
    console.log(`\n📱 Notification (${this.config.notifyOnComplete}): ${message}`);
  }
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

function statusCmd(swid: string): void {
  const pf = join(LOGS_DIR, `${swid}_progress.json`);
  const rf = join(RESULTS_DIR, `${swid}.json`);

  if (existsSync(pf)) {
    const d = JSON.parse(readFileSync(pf, "utf-8")) as ProgressData;
    console.log(`🔍 Swarm Status: ${d.swarmId}`);
    console.log(`   Status: ${d.status}`);
    console.log(`   Progress: ${d.completed}/${d.totalTasks} (${d.percentComplete}%)`);
    console.log(`   Failed: ${d.failed}`);
    console.log(`   Elapsed: ${Math.round(d.elapsedMs / 1000)}s`);
  } else {
    console.log(`No progress file for swarm: ${swid}`);
  }

  if (existsSync(rf)) {
    const stats = readFileSync(rf);
    console.log(`   Results: ${rf} (${Math.round(stats.length / 1024)}KB)`);
  }
}

function doctorCmd(): void {
  console.log("🔧 Swarm Doctor v5.0.0\n");

  // Check directories
  [SWARM_DIR, LOGS_DIR, RESULTS_DIR].forEach(d => {
    console.log(`${existsSync(d) ? "✅" : "❌"} ${d}`);
  });

  // Check executors
  console.log("\nExecutors:");
  const executors = loadExecutors();
  for (const [id, ex] of Object.entries(executors)) {
    const bridge = getBridge(id, executors);
    console.log(`  ${bridge ? "✅" : "❌"} ${id}: ${ex.name}`);
  }

  // Check memory DB
  console.log(`\n${existsSync(MEMORY_DB) ? "✅" : "❌"} Memory DB: ${MEMORY_DB}`);

  // Check registries
  console.log(`\n${existsSync(REGISTRY) ? "✅" : "❌"} Executor registry: ${REGISTRY}`);
  console.log(`${existsSync(PERSONA_REGISTRY) ? "✅" : "❌"} Persona registry: ${PERSONA_REGISTRY}`);
  console.log(`${existsSync(AGENCY_PERSONAS) ? "✅" : "❌"} Agency personas: ${AGENCY_PERSONAS}`);

  console.log("\n✅ Doctor complete");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: bun orchestrate-v5.ts <tasks.json> [options]");
    console.log("       bun orchestrate-v5.ts status <swarm-id>");
    console.log("       bun orchestrate-v5.ts doctor");
    console.log("\nOptions:");
    console.log("  --swarm-id ID         Set swarm ID");
    console.log("  --concurrency N       Max parallel tasks (default: 8)");
    console.log("  --timeout S          Per-task timeout (default: 600s)");
    console.log("  --max-retries N      Max retries per task (default: 3)");
    console.log("  --strategy STRAT     balanced|fast|reliable|explore (default: balanced)");
    console.log("  --dag-mode MODE      streaming|waves (default: streaming)");
    console.log("  --no-cascade         Skip downstream tasks when root fails");
    console.log("  --notify CHANNEL     none|sms|email (default: none)");
    console.log("  --4-signal           Use 4-signal routing (default: 6-signal)");
    process.exit(1);
  }

  if (args[0] === "status") {
    if (args.length < 2) {
      console.log("Usage: orchestrate-v5.ts status <swarm-id>");
      process.exit(1);
    }
    statusCmd(args[1]);
    process.exit(0);
  }

  if (args[0] === "doctor") {
    doctorCmd();
    process.exit(0);
  }

  const campaign = args[0];
  if (!existsSync(campaign)) {
    console.log(`File not found: ${campaign}`);
    process.exit(1);
  }

  // Parse tasks
  let tasks: Task[];
  try {
    tasks = JSON.parse(readFileSync(campaign, "utf-8"));
  } catch (e) {
    console.log(`Invalid JSON: ${e}`);
    process.exit(1);
  }

  // Parse options
  let swarmId = `swarm_${Date.now()}`;
  const config: Partial<OrchestratorConfig> = {};

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--swarm-id":
        if (i + 1 < args.length) swarmId = args[++i];
        break;
      case "--concurrency":
        if (i + 1 < args.length) config.localConcurrency = parseInt(args[++i]);
        break;
      case "--timeout":
        if (i + 1 < args.length) config.timeoutSeconds = parseInt(args[++i]);
        break;
      case "--max-retries":
        if (i + 1 < args.length) config.maxRetries = parseInt(args[++i]);
        break;
      case "--strategy":
        if (i + 1 < args.length) config.routingStrategy = args[++i] as RoutingStrategy;
        break;
      case "--dag-mode":
        if (i + 1 < args.length) config.dagMode = args[++i] as DAGMode;
        break;
      case "--no-cascade":
        config.cascadeMode = false;
        break;
      case "--notify":
        if (i + 1 < args.length) config.notifyOnComplete = args[++i] as NotificationChannel;
        break;
      case "--4-signal":
        config.useSixSignalRouting = false;
        break;
    }
  }

  // Run orchestrator
  const orchestrator = new SwarmOrchestrator(swarmId, config);
  await orchestrator.run(tasks);
}

main().catch(e => {
  console.error(`Fatal error: ${e}`);
  process.exit(1);
});
