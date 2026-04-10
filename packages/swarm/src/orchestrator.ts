/**
 * Main Swarm Orchestrator
 *
 * Coordinates task execution with circuit breakers, routing, and DAG execution.
 * Transport-agnostic: all executor communication goes through ExecutorTransport.
 *
 * Phase 1 extensions: Executor Selector, Budget Governor, Role Registry integration.
 * Phase 2 extensions: RAG Enrichment, Hierarchical Delegation wiring.
 * Phase 3 extensions: Pipeline enforcement gates (seed validation, post-flight eval, gap audit).
 */

import type { Task, TaskResult, SwarmConfig, ExecutorCapability, PipelineGateConfig } from './types.js';
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
import { enrichTasksWithDomainContext } from './rag/domain-context.js';
import {
  evaluateDelegation,
  renderHierarchicalPolicyBlock,
  stripDelegationReport,
} from './hierarchical.js';
import { runGapAudit, type GapAuditReport } from './verification/gap-audit.js';

const DEFAULT_PIPELINE_GATES: PipelineGateConfig = {
  seedValidation: true,
  postFlightEval: true,
  gapAuditLoop: true,
  blockOnSeedFailure: true,
};

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
    this.budgetGovernor = new BudgetGovernor(this.config.dbPath);
    this.roleRegistry = new RoleRegistry(this.config.dbPath);

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

  private resolveExecutor(task: Task): { executorId: string; model?: string; fallbacks: string[] } {
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
    return { executorId: selection.executorId, model: selection.model, fallbacks: selection.fallbacks };
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

  private getPipelineGates(): PipelineGateConfig {
    return { ...DEFAULT_PIPELINE_GATES, ...this.config.pipelineGates };
  }

  /**
   * Seed Validation Gate — runs gap audit before execution.
   * Returns critical gaps found. Blocks execution if blockOnSeedFailure is true.
   */
  seedValidationGate(): { passed: boolean; report: GapAuditReport; criticalGaps: string[] } {
    console.log('\n  [SEED GATE] Running pre-execution seed validation...');
    const report = runGapAudit();
    const criticalGaps = report.gaps
      .filter(g => g.severity === 'critical')
      .map(g => `[${g.capabilityId}] ${g.message}`);

    if (criticalGaps.length > 0) {
      console.error(`  [SEED GATE] ❌ ${criticalGaps.length} critical gap(s) found:`);
      for (const gap of criticalGaps) {
        console.error(`    • ${gap}`);
      }
    } else {
      console.log(`  [SEED GATE] ✅ Passed (${report.summary.totalCapabilities} capabilities verified, ${report.gaps.length} non-critical warnings)`);
    }

    return { passed: report.passed, report, criticalGaps };
  }

  /**
   * Post-flight evaluation — analyzes execution results for quality signals.
   * Returns a structured report of successes, failures, and fallback usage.
   */
  postFlightEval(results: TaskResult[]): {
    passed: boolean;
    successRate: number;
    fallbacksUsed: number;
    failedTasks: string[];
    report: string;
  } {
    console.log('\n  [POST-FLIGHT] Running post-flight evaluation...');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const successRate = results.length > 0 ? successCount / results.length : 0;
    const fallbacksUsed = results.filter(r => (r.fallbacksAttempted ?? 0) > 0).length;
    const failedTasks = results.filter(r => !r.success).map(r => r.task.id);

    const lines: string[] = [
      `Post-Flight Evaluation Report`,
      `  Total tasks: ${results.length}`,
      `  Successes: ${successCount} (${(successRate * 100).toFixed(1)}%)`,
      `  Failures: ${failCount}`,
      `  Tasks using fallback executors: ${fallbacksUsed}`,
    ];

    if (failedTasks.length > 0) {
      lines.push(`  Failed tasks:`);
      for (const result of results.filter(r => !r.success)) {
        const fb = result.fallbacksAttempted ? ` (${result.fallbacksAttempted} fallbacks tried)` : '';
        lines.push(`    • ${result.task.id}: ${result.error?.slice(0, 150)}${fb}`);
      }
    }

    for (const result of results.filter(r => (r.fallbacksAttempted ?? 0) > 0 && r.success)) {
      lines.push(`  [RECOVERY] Task "${result.task.id}" succeeded via fallback executor "${result.effectiveExecutor}" after ${result.fallbacksAttempted} fallback(s)`);
    }

    const report = lines.join('\n');
    const passed = successRate >= 0.5; // At least 50% success rate to consider the run viable

    if (passed) {
      console.log(`  [POST-FLIGHT] ✅ Passed — ${(successRate * 100).toFixed(1)}% success rate`);
    } else {
      console.error(`  [POST-FLIGHT] ❌ Failed — ${(successRate * 100).toFixed(1)}% success rate (threshold: 50%)`);
    }

    return { passed, successRate, fallbacksUsed, failedTasks, report };
  }

  /**
   * Post-execution gap audit loop — runs the 4-question gap audit after execution.
   * Logs findings but does not block (informational for the caller).
   */
  postExecutionGapAudit(): GapAuditReport {
    console.log('\n  [GAP AUDIT] Running post-execution gap audit loop...');
    const report = runGapAudit();

    const criticals = report.gaps.filter(g => g.severity === 'critical');
    const warnings = report.gaps.filter(g => g.severity === 'warning');

    if (criticals.length === 0 && warnings.length === 0) {
      console.log(`  [GAP AUDIT] ✅ All 3 checks passed — no gaps found`);
    } else {
      if (criticals.length > 0) {
        console.error(`  [GAP AUDIT] ❌ ${criticals.length} critical gap(s):`);
        for (const g of criticals) {
          console.error(`    • [${g.category}] ${g.message}`);
          console.error(`      → ${g.remediation}`);
        }
      }
      if (warnings.length > 0) {
        console.log(`  [GAP AUDIT] ⚠ ${warnings.length} warning(s):`);
        for (const g of warnings) {
          console.log(`    • [${g.category}] ${g.message}`);
        }
      }
    }

    return report;
  }

  async run(tasks: Task[]): Promise<TaskResult[]> {
    const gates = this.getPipelineGates();
    console.log(`Starting swarm execution with ${tasks.length} tasks`);
    console.log(`Mode: ${this.config.dagMode}, Concurrency: ${this.config.localConcurrency}`);
    console.log(`Pipeline gates: seed=${gates.seedValidation}, postFlight=${gates.postFlightEval}, gapAudit=${gates.gapAuditLoop}`);

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

    // Pre-flight 0.5: Seed Validation Gate (mandatory by default)
    if (gates.seedValidation) {
      const seedResult = this.seedValidationGate();
      if (!seedResult.passed && gates.blockOnSeedFailure) {
        console.error('  [SEED GATE] Blocking execution — critical gaps must be resolved first');
        return tasks.map(task => ({
          task,
          success: false,
          error: `Seed validation failed: ${seedResult.criticalGaps.join('; ')}`,
          durationMs: 0,
          retries: 0,
        }));
      }
    } else {
      console.log('  [SEED GATE] ⚠ SKIPPED (pipelineGates.seedValidation = false)');
    }

    // Pre-flight 1: Resolve executors for all tasks via Executor Selector
    for (const task of tasks) {
      if (!task.executor || task.executor === 'auto') {
        const resolved = this.resolveExecutor(task);
        task.executor = resolved.executorId;
        if (resolved.model) task.model = resolved.model;
        task.fallbackExecutors = resolved.fallbacks;
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

    // Pre-flight 2.5: Domain context injection (operational context from memory system)
    if (this.config.enableMemory) {
      try {
        const { enrichedCount, domain } = enrichTasksWithDomainContext(tasks);
        if (enrichedCount > 0) {
          console.log(`  [DOMAIN CTX] Injected ${domain} context into ${enrichedCount}/${tasks.length} tasks`);
        }
      } catch (err) {
        console.log(`  [DOMAIN CTX] Domain context injection failed (non-blocking): ${err}`);
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

    // Post-flight 3: Post-flight evaluation (mandatory by default)
    if (gates.postFlightEval) {
      const evalResult = this.postFlightEval(results);
      if (!evalResult.passed) {
        console.error(`  [POST-FLIGHT] Swarm run has low success rate (${(evalResult.successRate * 100).toFixed(1)}%)`);
      }
    } else {
      console.log('  [POST-FLIGHT] ⚠ SKIPPED (pipelineGates.postFlightEval = false)');
    }

    // Post-flight 4: Gap audit loop (mandatory by default)
    if (gates.gapAuditLoop) {
      this.postExecutionGapAudit();
    } else {
      console.log('  [GAP AUDIT] ⚠ SKIPPED (pipelineGates.gapAuditLoop = false)');
    }

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
