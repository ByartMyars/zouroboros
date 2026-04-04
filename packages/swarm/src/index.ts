/**
 * Zouroboros Swarm
 * 
 * Multi-agent orchestration with circuit breakers, 6-signal routing, and DAG execution.
 * 
 * @module zouroboros-swarm
 */

// Core types
export type {
  Task,
  TaskResult,
  SwarmConfig,
  ExecutorCapability,
  ExecutorRegistryEntry,
  RouteDecision,
  RoutingStrategy,
  DAGMode,
  ErrorCategory,
  CircuitBreakerState,
} from './types.js';

// Circuit breaker
export { CircuitBreaker, CircuitBreakerRegistry } from './circuit/breaker.js';

// Routing
export { RoutingEngine, type RoutingContext } from './routing/engine.js';

// Registry
export { loadRegistry, findExecutor, listExecutors, getLocalExecutors } from './registry/loader.js';

// Executor
export { BridgeExecutor, type BridgeExecutionOptions } from './executor/bridge.js';

// DAG
export { DAGExecutor, type ExecutionContext, type ExecutionProgress } from './dag/executor.js';

// Streaming capture
export { StreamCapture, type StreamCaptureConfig, type CapturedChunk, type StreamStats } from './streaming/capture.js';

// Stagnation detection
export {
  StagnationDetector,
  type StagnationConfig,
  type StagnationEvent,
  type TaskMonitorState,
  type StagnationType,
  type RecoveryAction,
} from './stagnation/detector.js';

// Cascade manager
export {
  CascadeManager,
  type CascadeConfig,
  type CascadeEvent,
  type TaskDependencyInfo,
  type CascadePolicy,
  type FailureImpact,
} from './cascade/manager.js';

// Cross-task context sharing
export {
  ContextSharingManager,
  type ContextSharingConfig,
  type SharedContext,
  type TaskOutputSummary,
  type ContextScope,
  type ArtifactType,
} from './context/sharing.js';

// Token optimizer
export {
  TokenOptimizer,
  type TokenOptimizerConfig,
  type TokenBudget,
  type ContextInjection,
  type TokenUsageReport,
  type MemoryStrategy,
  type InjectionTier,
} from './tokens/optimizer.js';

// Main orchestrator
export { SwarmOrchestrator } from './orchestrator.js';

// Transport abstraction layer
export {
  BridgeTransport,
} from './transport/bridge-transport.js';
export { createTransport } from './transport/factory.js';
export type {
  ExecutorTransport,
  SessionUpdate,
  TransportOptions,
  HealthStatus,
  TransportType,
} from './transport/types.js';

// ACP transport
export { ACPTransport, type ACPTransportConfig } from './transport/acp-transport.js';
