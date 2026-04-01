/**
 * Zouroboros Workflow
 *
 * Spec-first development tools: interview, evaluation, unstuck, and autoloop.
 *
 * @module zouroboros-workflow
 */

// Spec-First Interview
export {
  scoreAmbiguity,
} from './interview/ambiguity.js';

export {
  generateSeed,
  formatSeedYAML,
} from './interview/seed.js';

export type {
  InterviewConfig,
  AmbiguityScore,
  SeedSpecification
} from './interview/types.js';

// Three-Stage Evaluation
export {
  runMechanicalChecks
} from './evaluate/mechanical.js';

export {
  parseSeed,
  runSemanticEvaluation,
  calculateDrift
} from './evaluate/semantic.js';

export type {
  MechanicalCheck,
  SeedSpec,
  SemanticResult,
  EvaluationReport
} from './evaluate/types.js';

// Unstuck Lateral
export {
  autoSelectPersona,
  getStrategy,
  getAllPersonas,
  STRATEGIES
} from './unstuck/strategies.js';

export type {
  UnstuckPersona,
  UnstuckStrategy,
  UnstuckSession,
  AutoSelectResult
} from './unstuck/types.js';

// Autoloop
export {
  parseProgram,
  validateProgram
} from './autoloop/parser.js';

export {
  initState,
  shouldContinue,
  isBetter,
  runExperiment,
  saveResults,
  getStagnationLevel,
  getStagnationModifier
} from './autoloop/loop.js';

export type {
  ProgramConfig,
  MetricConfig,
  ConstraintConfig,
  StagnationConfig,
  ExperimentRecord,
  LoopState,
  LoopStatus
} from './autoloop/types.js';

// Version
export const VERSION = '2.0.0';
