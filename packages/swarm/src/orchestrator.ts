/**
 * Main Swarm Orchestrator
 *
 * Coordinates task execution with circuit breakers, routing, and DAG execution.
 * Transport-agnostic: all executor communication goes through ExecutorTransport.
 *
 * Phase 1 extensions: Executor Selector, Budget Governor, Role Registry integration.
 * Phase 2 extensions: RAG Enrichment, Hierarchical Delegation wiring.
 */

import type { Task, TaskResult, SwarmConfig, ExecutorCapability } from './types.js';
import { CircuitBreakerRegistry } from './circuit/breaker.js';
import { RoutingEngine } from './routing/engine.js';
import { loadRegistry, getLocalExecutors } from './registry/loader.js';
import { DAGExecutor, ExecutionContext } from './dag/executor.js';
import { createTransport } from './transport/factory.js';
import type { ExecutorTransport } from './transport/types.js';
import { selectExecutor, type BudgetSnapshot, type HealthSnapshot } from './selector/executor-selector.js';
import { BudgetGovernor, type BudgetConfig } from './budget/governor.js';
import { RoleRegistry } from './roles/registry.js';
import { prefetchRAGForTasks } from './rag/index.js';
import {
  evaluateDelegation,
  renderHierarchicalPolicyBlock,
  stripDelegationReport,
} from './hierarchical.js';

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
  private transports: Map<string, ExecutorTransport>;
  private capabilities: ExecutorCapability[];
  private budgetGovernor: BudgetGovernor;
  private roleRegistry: RoleRegistry;
  private registryEntries: ReturnType<typeof getLocalExecutors>;

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakers = new CircuitBreakerRegistry();
    this.transports = new Map();
    this.capabilities = [];
    this.registryEntries = [];
    this.budgetGovernor = new BudgetGovernor();
    this.roleRegistry = new RoleRegistry();

    this.initializeTransports();

    this.routingEngine = new RoutingEngine({
      strategy: this.config.routingStrategy,
      useSixSignal: this.config.useSixSignalRouting,
      circuitBreakers: this.circuitBreakers,
      executorCapabilities: this.capabilities,
    });
  }

  private initializeTransports(): void {
    const registry = loadRegistry();
    const localExecutors = getLocalExecutors(registry);
    this.registryEntries = localExecutors;

    for (const entry of localExecutors) {
      const cb = this.circuitBreakers.get(entry.id);
      const transport = createTransport(entry, cb);
      this.transports.set(entry.id, transport);

      this.capabilities.push({
        id: entry.id,
        name: entry.name,
        expertise: entry.expertise,
        bestFor: entry.bestFor,
        isLocal: true,
      });
    }
  }

  private resolveExecutor(task: Task): { executorId: string; model?: string } {
    const health: HealthSnapshot = {};
    const cbStatus = this.circuitBreakers.getStatus();
    for (const [id, state] of Object.entries(cbStatus)) {
      health[id] = { state: state.state, failures: state.failures };
    }

    let budget: BudgetSnapshot | null = null;
    try {
      const budgetState = this.budgetGovernor.getState('current');
      if (budgetState.totalBudgetUSD > 0) {
        budget = {
          totalSpentUSD: budgetState.totalSpentUSD,
          totalBudgetUSD: budgetState.totalBudgetUSD,
          perExecutor: budgetState.perExecutor,
        };
      }
    } catch {}

    let roleResolution = null;
    if (task.role) {
      roleResolution = this.roleRegistry.resolve(task.role);
    }

    const selection = selectExecutor(task, budget, health, this.registryEntries, roleResolution, this.routingEngine);
    return { executorId: selection.executorId, model: selection.model };
  }

  initBudget(config: Omit<BudgetConfig, 'swarmId'> & { swarmId?: string }): void {
    this.budgetGovernor.initSwarm({ swarmId: config.swarmId ?? 'current', ...config });
  }

  getBudgetState(swarmId: string = 'current'): ReturnType<BudgetGovernor['getState']> {
    return this.budgetGovernor.getState(swarmId);
  }

  getBudgetGovernor(): BudgetGovernor {
    return this.budgetGovernor;
  }

  getRoleRegistry(): RoleRegistry {
    return this.roleRegistry;
  }

  getRoutingEngine(): RoutingEngine {
    return this.routingEngine;
  }

  /**
   * Preflight data checks — lightweight runtime validation before dispatch.
   * Returns warnings (non-blocking) and errors (blocking if strict mode).
   */
  preflightDataChecks(): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check 1: At least one transport registered
    if (this.transports.size === 0) {
      errors.push('No executor transports registered — tasks cannot be dispatched');
    }

    // Check 2: RoleRegistry populated (warn if empty, tasks with role: will fallback)
    try {
      const roleCount = this.roleRegistry.count();
      if (roleCount === 0) {
        warnings.push('RoleRegistry is empty — role-based routing will fall through to tag heuristics. Run persona seeder to populate.');
      }
    } catch {
      warnings.push('Could not query RoleRegistry — role-based routing unavailable');
    }

    // Check 3: Circuit breakers not all OPEN
    const cbStatus = this.circuitBreakers.getStatus();
    const allOpen = Object.values(cbStatus).every(s => s.state === 'OPEN');
    if (Object.keys(cbStatus).length > 0 && allOpen) {
      errors.push('All circuit breakers are OPEN — no healthy executors available');
    }

    return { warnings, errors };
  }

  async run(tasks: Task[]): Promise<TaskResult[]> {
    console.log(`Starting swarm execution with ${tasks.length} tasks`);
    console.log(`Mode: ${this.config.dagMode}, Concurrency: ${this.config.localConcurrency}`);

    // Pre-flight 0: Data checks
    const { warnings, errors } = this.preflightDataChecks();
    for (const w of warnings) console.log(`  [PREFLIGHT WARN] ${w}`);
    for (const e of errors) console.error(`  [PREFLIGHT ERROR] ${e}`);
    if (errors.length > 0) {
      console.error('  Pre-flight errors detected — aborting swarm execution');
      return tasks.map(task => ({
        task,
        success: false,
        error: `Pre-flight failed: ${errors.join('; ')}`,
        durationMs: 0,
        retries: 0,
      }));
    }

    // Pre-flight 1: Resolve executors for all tasks via Executor Selector
    for (const task of tasks) {
      if (!task.executor || task.executor === 'auto') {
        const resolved = this.resolveExecutor(task);
        task.executor = resolved.executorId;
        if (resolved.model) task.model = resolved.model;
      }
    }

    // Pre-flight 2: RAG enrichment (inject memory context into prompts)
    if (this.config.ragEnrichment?.enabled !== false && this.config.enableMemory) {
      try {
        const ragOptions = {
          topK: this.config.ragEnrichment?.topK,
          minScore: this.config.ragEnrichment?.minScore,
        };
        const ragMap = await prefetchRAGForTasks(tasks, ragOptions);
        let enrichedCount = 0;
        for (const task of tasks) {
          const ctx = ragMap.get(task.id);
          if (ctx) {
            task.ragContext = ctx;
            task.task = ctx + '\n\n' + task.task;
            enrichedCount++;
          }
        }
        if (enrichedCount > 0) {
          console.log(`  [RAG] Enriched ${enrichedCount}/${tasks.length} tasks with memory context`);
        }
      } catch (err) {
        console.log(`  [RAG] Pre-flight enrichment failed (non-blocking): ${err}`);
      }
    }

    // Pre-flight 3: Hierarchical delegation policy injection
    if (this.config.hierarchicalDelegation?.enabled) {
      for (const task of tasks) {
        const executorId = task.executor || 'claude-code';
        const decision = evaluateDelegation(task, executorId, {
          hierarchicalDelegation: this.config.hierarchicalDelegation,
        });
        const policyBlock = renderHierarchicalPolicyBlock(task, executorId, decision);
        if (policyBlock) {
          task.task = policyBlock + task.task;
        }
      }
    }

    const budgetGov = this.budgetGovernor;

    const context: ExecutionContext = {
      config: this.config,
      getExecutor: (id: string) => {
        try {
          const state = budgetGov.getState('current');
          if (state.capReached && state.hardCapAction === 'downgrade') {
            const target = budgetGov.getDowngradeTarget(id);
            const transport = this.transports.get(target.executorId);
            if (transport) return transport;
          }
        } catch {}
        return this.transports.get(id);
      },
    };

    const dag = new DAGExecutor(tasks, context);
    const results = await dag.execute(this.config.dagMode);

    // Post-flight 1: Strip hierarchical delegation reports from results
    if (this.config.hierarchicalDelegation?.enabled) {
      for (const result of results) {
        if (result.output) {
          const parsed = stripDelegationReport(result.output);
          result.output = parsed.cleanOutput;
          result.childRecords = parsed.childRecords;
          result.artifacts = [...(result.artifacts || []), ...parsed.artifacts];
          result.delegated = parsed.delegated;
        }
      }
    }

    // Post-flight 2: Record budget usage from results
    for (const result of results) {
      if (result.tokensUsed && result.tokensUsed > 0) {
        const executor = result.effectiveExecutor ?? result.task.executor ?? 'claude-code';
        const model = result.modelUsed ?? result.task.model ?? 'sonnet';
        const inputTokens = Math.round(result.tokensUsed * 0.7);
        const outputTokens = Math.round(result.tokensUsed * 0.3);
        budgetGov.recordUsage('current', executor, model, inputTokens, outputTokens);
      }
    }

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

  async shutdown(): Promise<void> {
    await Promise.all([...this.transports.values()].map(t => t.shutdown()));
  }
}
