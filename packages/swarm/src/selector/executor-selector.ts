/**
 * Executor Selector — dynamic task→executor routing.
 *
 * Pure TypeScript heuristic (~5ms, zero API cost).
 * Replaces fixed executorId with intelligent best-fit routing.
 *
 * When a RoutingEngine is provided, Priority 4 uses 8-signal composite
 * scoring instead of simple tag matching.
 */

import type { Task, ExecutorRegistryEntry, ComplexityTier, BudgetSnapshot, HealthSnapshot } from '../types.js';
import type { RoutingEngine } from '../routing/engine.js';

// Re-export from types.ts for backward compatibility
export type { BudgetSnapshot, HealthSnapshot } from '../types.js';

export interface ExecutorSelection {
  executorId: string;
  model?: string;
  confidence: number;
  reasoning: string;
  fallbacks: string[];
}

interface RoleResolution {
  executorId: string;
  model?: string;
}

const TAG_ROUTING: Record<string, string[]> = {
  'claude-code': ['reasoning', 'planning', 'architecture', 'system-design', 'complex', 'analysis'],
  'gemini': ['ui', 'frontend', 'visual', 'design', 'css', 'component', 'layout', 'prototyping'],
  'codex': ['backend', 'api', 'refactor', 'database', 'server', 'endpoint', 'migration'],
  'hermes': ['research', 'web', 'multi-platform', 'investigation', 'scraping', 'audit', 'review'],
};

const COST_RANKING = ['hermes', 'gemini', 'codex', 'claude-code'];

const FALLBACK_CHAINS: Record<string, string[]> = {
  'claude-code': ['gemini', 'codex', 'hermes'],
  'gemini': ['codex', 'claude-code', 'hermes'],
  'codex': ['claude-code', 'gemini', 'hermes'],
  'hermes': ['gemini', 'codex', 'claude-code'],
};

export function inferComplexity(task: Task): ComplexityTier {
  const len = task.task.length;
  if (len < 100) return 'trivial';
  if (len < 300) return 'simple';
  if (len < 800) return 'moderate';
  return 'complex';
}

export function selectExecutor(
  task: Task,
  budget: BudgetSnapshot | null,
  health: HealthSnapshot,
  executors: ExecutorRegistryEntry[],
  roleResolution?: RoleResolution | null,
  routingEngine?: RoutingEngine | null,
): ExecutorSelection {
  const availableIds = new Set(executors.map(e => e.id));

  // Priority 1: Explicit executorId in task (backward compat)
  if (task.executor && task.executor !== 'auto') {
    return {
      executorId: task.executor,
      confidence: 1.0,
      reasoning: `Explicit executorId="${task.executor}" in task definition`,
      fallbacks: FALLBACK_CHAINS[task.executor] ?? [],
    };
  }

  // Priority 2: Role-based resolution (hard override when no routing engine)
  if (roleResolution && !routingEngine) {
    return {
      executorId: roleResolution.executorId,
      model: roleResolution.model,
      confidence: 0.9,
      reasoning: `Resolved from role registry`,
      fallbacks: FALLBACK_CHAINS[roleResolution.executorId] ?? [],
    };
  }

  // Priority 3: Budget override — if < 20% remaining, force cheapest (when no routing engine)
  if (!routingEngine && budget && budget.totalBudgetUSD > 0) {
    const remaining = budget.totalBudgetUSD - budget.totalSpentUSD;
    const pct = remaining / budget.totalBudgetUSD;
    if (pct < 0.20) {
      const cheapest = findCheapestHealthy(health, availableIds);
      return {
        executorId: cheapest,
        confidence: 0.85,
        reasoning: `Budget at ${Math.round(pct * 100)}% — downgrading to cheapest executor "${cheapest}"`,
        fallbacks: FALLBACK_CHAINS[cheapest] ?? [],
      };
    }
  }

  // Priority 4: Composite routing via RoutingEngine (8-signal when available)
  if (routingEngine) {
    const complexity = inferComplexity(task);
    const decision = routingEngine.route(task, complexity, {
      budget,
      roleExecutorId: roleResolution?.executorId ?? null,
    });

    // Check health — skip if circuit breaker open
    if (health[decision.executorId]?.state === 'OPEN') {
      const fallback = FALLBACK_CHAINS[decision.executorId]?.find(
        fb => health[fb]?.state !== 'OPEN' && availableIds.has(fb)
      );
      if (fallback) {
        return {
          executorId: fallback,
          confidence: 0.6,
          reasoning: `Primary "${decision.executorId}" circuit breaker OPEN — falling back to "${fallback}"`,
          fallbacks: FALLBACK_CHAINS[fallback]?.filter(f => f !== decision.executorId) ?? [],
        };
      }
    }

    return {
      executorId: decision.executorId,
      model: roleResolution?.model,
      confidence: Math.min(0.95, decision.compositeScore),
      reasoning: `8-signal composite: score=${decision.compositeScore.toFixed(3)} via ${decision.method}`,
      fallbacks: FALLBACK_CHAINS[decision.executorId] ?? [],
    };
  }

  // Priority 4 fallback: Tag-based heuristic matching (legacy, no routing engine)
  const taskText = `${task.task} ${task.persona || ''} ${task.role || ''}`.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [executorId, tags] of Object.entries(TAG_ROUTING)) {
    if (!availableIds.has(executorId)) continue;
    let score = 0;
    for (const tag of tags) {
      if (taskText.includes(tag)) score++;
    }
    scores[executorId] = score;
  }

  let bestId = 'claude-code';
  let bestScore = 0;
  for (const [id, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  // Check health — skip if circuit breaker open
  if (health[bestId]?.state === 'OPEN') {
    const fallback = FALLBACK_CHAINS[bestId]?.find(
      fb => health[fb]?.state !== 'OPEN' && availableIds.has(fb)
    );
    if (fallback) {
      return {
        executorId: fallback,
        confidence: 0.6,
        reasoning: `Primary "${bestId}" circuit breaker OPEN — falling back to "${fallback}"`,
        fallbacks: FALLBACK_CHAINS[fallback]?.filter(f => f !== bestId) ?? [],
      };
    }
  }

  const confidence = bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0.5;

  return {
    executorId: bestId,
    confidence,
    reasoning: bestScore > 0
      ? `Tag match: ${bestScore} tag(s) matched for "${bestId}"`
      : `No strong tag match — defaulting to "${bestId}"`,
    fallbacks: FALLBACK_CHAINS[bestId] ?? [],
  };
}

function findCheapestHealthy(health: HealthSnapshot, available: Set<string>): string {
  for (const id of COST_RANKING) {
    if (available.has(id) && health[id]?.state !== 'OPEN') return id;
  }
  return COST_RANKING[0];
}
