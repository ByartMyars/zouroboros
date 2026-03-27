/**
 * Main resolver for Zouroboros OmniRoute integration
 * 
 * Combines complexity analysis with OmniRoute API to recommend optimal model combos.
 */

import { estimateComplexity, TIER_TO_COMBO } from './complexity.js';
import { OmniRouteClient, getOmniRouteClient } from './client.js';
import type {
  RoutingOptions,
  RoutingResult,
  ComplexityEstimate,
  OmniRouteRecommendation,
  ConstraintValue,
} from './types.js';

export interface ResolveOptions {
  /** The task text to analyze */
  taskText: string;
  /** Budget constraint: low = prefer cheaper models */
  budget?: ConstraintValue;
  /** Latency constraint: low = prefer faster models */
  latency?: ConstraintValue;
  /** Quality constraint: high = prefer better models */
  quality?: ConstraintValue;
  /** Speed constraint: high = prefer faster models */
  speed?: ConstraintValue;
  /** Whether to query OmniRoute for combo recommendation */
  useOmniRoute?: boolean;
  /** Custom OmniRoute client configuration */
  omniRouteConfig?: ConstructorParameters<typeof OmniRouteClient>[0];
}

export interface ResolveResult {
  /** The determined complexity tier */
  tier: ComplexityEstimate['tier'];
  /** The complexity score (0-1) */
  score: number;
  /** The inferred task type */
  taskType: ComplexityEstimate['inferredTaskType'];
  /** The recommended combo name */
  resolvedCombo: string;
  /** OmniRoute recommendation (if useOmniRoute was true) */
  omniRouteRecommendation: OmniRouteRecommendation | null;
  /** Individual complexity signals */
  signals: ComplexityEstimate['signals'];
  /** Detected domain pattern */
  domainPattern: ComplexityEstimate['domainPattern'];
  /** Detected constraints */
  constraints: ComplexityEstimate['constraints'];
  /** Detected scope modifier */
  scopeModifier: ComplexityEstimate['scopeModifier'];
  /** Time taken to resolve (ms) */
  performanceMs: number;
  /** Error message if OmniRoute query failed */
  omniRouteError?: string;
}

/**
 * Resolve a task to the optimal model combo
 * 
 * This function:
 * 1. Analyzes the task text for complexity signals
 * 2. Detects task type, domain, constraints, and scope
 * 3. Calculates a complexity tier and score
 * 4. Optionally queries OmniRoute for combo recommendations
 * 5. Returns the resolved combo name and full analysis
 * 
 * @example
 * ```typescript
 * const result = await resolve({
 *   taskText: "Implement a webhook retry system with exponential backoff",
 *   useOmniRoute: true,
 * });
 * 
 * console.log(result.resolvedCombo); // "swarm-mid" or OmniRoute recommendation
 * ```
 */
export async function resolve(options: ResolveOptions): Promise<ResolveResult> {
  const startTime = performance.now();

  // Step 1: Estimate complexity
  const complexity = estimateComplexity(options.taskText, {
    budget: options.budget,
    latency: options.latency,
    quality: options.quality,
    speed: options.speed,
  });

  const staticCombo = TIER_TO_COMBO[complexity.tier];
  const taskType = complexity.inferredTaskType;

  // Step 2: Query OmniRoute if requested
  let omniRouteRecommendation: OmniRouteRecommendation | null = null;
  let omniRouteError: string | undefined;

  if (options.useOmniRoute) {
    try {
      const client = options.omniRouteConfig
        ? new OmniRouteClient(options.omniRouteConfig)
        : getOmniRouteClient();

      omniRouteRecommendation = await client.getBestCombo(
        taskType,
        complexity.tier,
        {
          budgetConstraint: options.budget === 'low' ? 2.0 : undefined,
          latencyConstraint: options.latency === 'low' ? 1 : undefined,
        }
      );
    } catch (error: any) {
      omniRouteError = error.message;
      // Fall back to static combo
    }
  }

  const endTime = performance.now();

  return {
    tier: complexity.tier,
    score: complexity.score,
    taskType,
    resolvedCombo: omniRouteRecommendation?.recommendedCombo.name ?? staticCombo,
    omniRouteRecommendation,
    signals: complexity.signals,
    domainPattern: complexity.domainPattern,
    constraints: complexity.constraints,
    scopeModifier: complexity.scopeModifier,
    performanceMs: Math.round((endTime - startTime) * 100) / 100,
    omniRouteError,
  };
}

/**
 * Quick resolve - returns just the combo name
 * 
 * @example
 * ```typescript
 * const combo = await resolveQuick("Fix the login bug");
 * console.log(combo); // "swarm-light"
 * ```
 */
export function resolveQuick(taskText: string): string {
  const complexity = estimateComplexity(taskText);
  return TIER_TO_COMBO[complexity.tier];
}

/**
 * Resolve with full JSON output (for CLI)
 */
export async function resolveJSON(options: ResolveOptions): Promise<Record<string, unknown>> {
  const result = await resolve(options);
  
  return {
    complexity: {
      tier: result.tier,
      score: result.score,
      signals: result.signals,
      inferredTaskType: result.taskType,
      domainPattern: result.domainPattern,
      constraints: result.constraints,
      scopeModifier: result.scopeModifier,
      staticCombo: TIER_TO_COMBO[result.tier],
    },
    omniroute: result.omniRouteRecommendation,
    omnirouteError: result.omniRouteError,
    resolvedCombo: result.resolvedCombo,
    performanceMs: result.performanceMs,
  };
}
