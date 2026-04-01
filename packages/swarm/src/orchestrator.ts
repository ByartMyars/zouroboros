/**
 * Main Swarm Orchestrator
 * 
 * Coordinates task execution with circuit breakers, routing, and DAG execution.
 */

import type { Task, TaskResult, SwarmConfig, ExecutorCapability } from './types.js';
import { CircuitBreakerRegistry } from './circuit/breaker.js';
import { RoutingEngine } from './routing/engine.js';
import { loadRegistry, getLocalExecutors } from './registry/loader.js';
import { BridgeExecutor } from './executor/bridge.js';
import { DAGExecutor, ExecutionContext } from './dag/executor.js';

const DEFAULT_CONFIG: SwarmConfig = {
  localConcurrency: 8,
  timeoutSeconds: 600,
  maxRetries: 3,
  enableMemory: true,
  dagMode: 'streaming',
  notifyOnComplete: 'none',
  routingStrategy: 'balanced',
  useSixSignalRouting: true,
  stagnationEnabled: true,
};

export class SwarmOrchestrator {
  private config: SwarmConfig;
  private circuitBreakers: CircuitBreakerRegistry;
  private routingEngine: RoutingEngine;
  private executors: Map<string, BridgeExecutor>;
  private capabilities: ExecutorCapability[];

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakers = new CircuitBreakerRegistry();
    this.executors = new Map();
    this.capabilities = [];
    
    // Load registry and initialize executors
    this.initializeExecutors();
    
    // Initialize routing engine
    this.routingEngine = new RoutingEngine({
      strategy: this.config.routingStrategy,
      useSixSignal: this.config.useSixSignalRouting,
      circuitBreakers: this.circuitBreakers,
      executorCapabilities: this.capabilities,
    });
  }

  private initializeExecutors(): void {
    const registry = loadRegistry();
    const localExecutors = getLocalExecutors(registry);

    for (const entry of localExecutors) {
      const cb = this.circuitBreakers.get(entry.id);
      const executor = new BridgeExecutor(entry, cb);
      this.executors.set(entry.id, executor);
      
      this.capabilities.push({
        id: entry.id,
        name: entry.name,
        expertise: entry.expertise,
        bestFor: entry.bestFor,
        isLocal: true,
      });
    }
  }

  async run(tasks: Task[]): Promise<TaskResult[]> {
    console.log(`Starting swarm execution with ${tasks.length} tasks`);
    console.log(`Mode: ${this.config.dagMode}, Concurrency: ${this.config.localConcurrency}`);

    const context: ExecutionContext = {
      config: this.config,
      getExecutor: (id: string) => this.executors.get(id),
    };

    const dag = new DAGExecutor(tasks, context);
    const results = await dag.execute(this.config.dagMode);

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`\nSwarm execution complete:`);
    console.log(`  Success: ${successCount}/${tasks.length}`);
    console.log(`  Failed: ${failCount}/${tasks.length}`);

    return results;
  }

  getCircuitBreakerStatus(): Record<string, { state: string; failures: number }> {
    const status = this.circuitBreakers.getStatus();
    const simplified: Record<string, { state: string; failures: number }> = {};
    
    for (const [id, state] of Object.entries(status)) {
      simplified[id] = {
        state: state.state,
        failures: state.failures,
      };
    }
    
    return simplified;
  }

  resetCircuitBreakers(): void {
    this.circuitBreakers.resetAll();
  }
}
