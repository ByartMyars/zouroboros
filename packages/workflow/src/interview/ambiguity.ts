/**
 * Ambiguity scoring for spec-first interview
 */

import type { AmbiguityScore } from './types.js';

/**
 * Score the ambiguity of a request
 * Returns goal clarity, constraint clarity, success criteria clarity, and overall ambiguity
 */
export function scoreAmbiguity(request: string): AmbiguityScore {
  let goal = 0;
  let constraints = 0;
  let success = 0;

  const words = request.toLowerCase().split(/\s+/);
  const len = words.length;

  // Goal clarity signals
  const goalSignals = ['build', 'create', 'implement', 'add', 'fix', 'migrate', 'refactor', 'deploy', 'integrate'];
  const hasVerb = goalSignals.some((s) => words.includes(s));
  const hasObject = len > 2;
  const hasSpecificity = len > 6;
  goal = (hasVerb ? 0.3 : 0) + (hasObject ? 0.3 : 0.1) + (hasSpecificity ? 0.4 : 0.1);

  // Constraint signals
  const constraintWords = ['must', 'should', 'only', 'without', 'using', 'in', 'with', 'no', 'cannot', 'limit'];
  const constraintCount = constraintWords.filter((w) => words.includes(w)).length;
  constraints = Math.min(1.0, constraintCount * 0.25);

  // Success criteria signals
  const successWords = ['when', 'so that', 'passes', 'returns', 'displays', 'sends', 'saves', 'validates'];
  const successCount = successWords.filter((w) => request.toLowerCase().includes(w)).length;
  success = Math.min(1.0, successCount * 0.3);

  // Vagueness penalties
  const vagueWords = ['better', 'faster', 'improve', 'optimize', 'fix', 'update', 'change', 'nice', 'good'];
  const vagueCount = vagueWords.filter((w) => words.includes(w)).length;
  const vaguePenalty = vagueCount * 0.15;

  goal = Math.max(0, Math.min(1, goal - vaguePenalty * 0.5));
  constraints = Math.max(0, Math.min(1, constraints));
  success = Math.max(0, Math.min(1, success));

  const ambiguity = +(1 - (goal * 0.4 + constraints * 0.3 + success * 0.3)).toFixed(2);

  let assessment: string;
  if (ambiguity <= 0.2) {
    assessment = 'READY — Ambiguity is low enough to proceed to seed generation.';
  } else if (ambiguity <= 0.5) {
    assessment = 'NEEDS CLARIFICATION — Run a Socratic interview to fill gaps.';
  } else {
    assessment = 'HIGH AMBIGUITY — Significant interview required before any implementation.';
  }

  return {
    goal: +goal.toFixed(2),
    constraints: +constraints.toFixed(2),
    success: +success.toFixed(2),
    ambiguity,
    assessment,
  };
}
