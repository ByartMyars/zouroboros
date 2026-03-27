/**
 * Zouroboros OmniRoute Integration
 * 
 * Intelligent model combo selection for OmniRoute using complexity analysis.
 * 
 * @module zouroboros-omniroute
 * 
 * @example
 * ```typescript
 * import { resolve, OmniRouteClient } from 'zouroboros-omniroute';
 * 
 * // Quick resolution
 * const combo = resolveQuick("Fix the login bug");
 * 
 * // Full resolution with OmniRoute
 * const result = await resolve({
 *   taskText: "Implement webhook retry system",
 *   useOmniRoute: true,
 * });
 * ```
 */

export const VERSION = '2.0.0';

// Types
export type {
  ComplexityTier,
  TaskType,
  ConstraintType,
  ConstraintValue,
  ConstraintSource,
  ScopeModifier,
  ComplexitySignal,
  ConstraintSpec,
  DomainPattern,
  SemanticMatch,
  ComplexityEstimate,
  ComboModel,
  OmniRouteCombo,
  OmniRouteRecommendation,
  OmniRouteConfig,
  RoutingOptions,
  RoutingResult,
  FeedbackEntry,
  WeightConfig,
  TaskFitness,
} from './types.js';

// Complexity Analysis
export {
  estimateComplexity,
  computeSignals,
  inferTaskTypeSemantic,
  detectDomainPattern,
  detectConstraints,
  detectScopeModifier,
  calculateTier,
  TIER_TO_COMBO,
  TIER_CANDIDATES,
} from './complexity.js';

// OmniRoute Client
export {
  OmniRouteClient,
  getOmniRouteClient,
  resetOmniRouteClient,
} from './client.js';

// Resolver
export {
  resolve,
  resolveQuick,
  resolveJSON,
  type ResolveOptions,
  type ResolveResult,
} from './resolver.js';

// CLI (when run directly)
export { default } from './cli.js';
