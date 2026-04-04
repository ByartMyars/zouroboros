/**
 * ExecutorTransport — transport abstraction layer for swarm executors.
 *
 * Both BridgeTransport (shell bridge) and ACPTransport (Agent Client Protocol)
 * implement this interface. The orchestrator and DAG executor are transport-agnostic.
 */

import type { Task, TaskResult } from '../types.js';

export interface SessionUpdate {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'progress';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TransportOptions {
  timeoutMs: number;
  workdir?: string;
  env?: Record<string, string>;
  context?: Record<string, unknown>;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
}

/**
 * ExecutorTransport — the single interface all executor backends implement.
 *
 * Phase 1: execute() returns Promise<TaskResult> (bridge-compatible).
 * Phase 2: executeWithUpdates() adds streaming for ACP transports.
 */
export interface ExecutorTransport {
  /** Execute a task and return the final result. */
  execute(task: Task, options: TransportOptions): Promise<TaskResult>;

  /**
   * Execute a task with streaming updates.
   * BridgeTransport returns an empty async iterable for updates.
   * ACPTransport yields real-time tool_call / text events.
   */
  executeWithUpdates(task: Task, options: TransportOptions): {
    updates: AsyncIterable<SessionUpdate>;
    result: Promise<TaskResult>;
  };

  /** Verify adapter/bridge is reachable and healthy. */
  healthCheck(): Promise<HealthStatus>;

  /** Gracefully release resources (connections, processes). */
  shutdown(): Promise<void>;
}

export type TransportType = 'bridge' | 'acp';
