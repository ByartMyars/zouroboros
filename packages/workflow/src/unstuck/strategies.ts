/**
 * Unstuck persona strategies and auto-selection
 */

import type { UnstuckPersona, UnstuckStrategy, AutoSelectResult } from './types.js';

/**
 * All available unstuck strategies
 */
export const STRATEGIES: Record<UnstuckPersona, UnstuckStrategy> = {
  hacker: {
    persona: 'hacker',
    name: 'Hacker',
    philosophy: "You don't accept 'impossible' — you find the path others miss.",
    approach: [
      'List every explicit and implicit constraint',
      'Question which constraints are actually required',
      'Look for edge cases and bypasses',
      'Consider solving a completely different (easier) problem'
    ],
    bestFor: ['Blocked by error', 'API limitation', 'Library bug', 'Impossible constraint']
  },
  
  researcher: {
    persona: 'researcher',
    name: 'Researcher',
    philosophy: 'Most blocks exist because we\'re missing information. Stop guessing — go find the answer.',
    approach: [
      'Define exactly what is unknown',
      'Gather evidence systematically (source code, docs, tests)',
      'Read official documentation first',
      'Form a specific, evidence-based hypothesis'
    ],
    bestFor: ['Unclear behavior', 'Undocumented APIs', 'Version-specific bugs', 'Should work but does not']
  },
  
  simplifier: {
    persona: 'simplifier',
    name: 'Simplifier',
    philosophy: 'Complexity is the enemy of progress. Remove until only the essential remains.',
    approach: [
      'List every component involved',
      'Challenge each one: "Is this truly necessary?"',
      'Find the absolute minimum that solves the core problem',
      'Ask: "What\'s the simplest thing that could possibly work?"'
    ],
    bestFor: ['Over-engineered solutions', 'Scope creep', 'Analysis paralysis', 'Too many moving parts']
  },
  
  architect: {
    persona: 'architect',
    name: 'Architect',
    philosophy: 'If you\'re fighting the architecture, the architecture is wrong.',
    approach: [
      'Identify structural symptoms (recurring bugs, high coupling)',
      'Map current abstractions and coupling points',
      'Find the root misalignment',
      'Propose minimal structural change that unblocks progress'
    ],
    bestFor: ['Recurring bugs in different forms', 'Simple changes touching many files', 'Performance problems']
  },
  
  contrarian: {
    persona: 'contrarian',
    name: 'Contrarian',
    philosophy: 'The opposite of a great truth is often another great truth.',
    approach: [
      'List every assumption being made',
      'Consider: what if the opposite were true?',
      'Challenge the problem statement itself',
      'Ask: what would happen if we did nothing?'
    ],
    bestFor: ['Groupthink', 'Assumed requirements', 'Obvious solutions not working']
  }
};

/**
 * Signal patterns for auto-selecting the best unstuck persona
 */
const SIGNAL_PATTERNS: Record<string, { persona: UnstuckPersona; weight: number }[]> = {
  // Hacker signals
  'error': [{ persona: 'hacker', weight: 3 }],
  'bug': [{ persona: 'hacker', weight: 3 }],
  'crash': [{ persona: 'hacker', weight: 3 }],
  'broken': [{ persona: 'hacker', weight: 3 }],
  'cannot': [{ persona: 'hacker', weight: 2 }],
  'won\'t': [{ persona: 'hacker', weight: 2 }],
  'impossible': [{ persona: 'hacker', weight: 5 }],
  'constraint': [{ persona: 'hacker', weight: 2 }],
  'limitation': [{ persona: 'hacker', weight: 2 }],
  
  // Researcher signals
  'don\'t understand': [{ persona: 'researcher', weight: 4 }],
  'unclear': [{ persona: 'researcher', weight: 3 }],
  'unexpected': [{ persona: 'researcher', weight: 3 }],
  'why': [{ persona: 'researcher', weight: 2 }],
  'behavior': [{ persona: 'researcher', weight: 2 }],
  'document': [{ persona: 'researcher', weight: 2 }],
  'version': [{ persona: 'researcher', weight: 2 }],
  
  // Simplifier signals
  'complex': [{ persona: 'simplifier', weight: 4 }],
  'too many': [{ persona: 'simplifier', weight: 4 }],
  'overwhelm': [{ persona: 'simplifier', weight: 3 }],
  'scope': [{ persona: 'simplifier', weight: 2 }],
  'scope creep': [{ persona: 'simplifier', weight: 5 }],
  'simple': [{ persona: 'simplifier', weight: 2 }],
  'mvp': [{ persona: 'simplifier', weight: 3 }],
  
  // Architect signals
  'recurring': [{ persona: 'architect', weight: 4 }],
  'keeps breaking': [{ persona: 'architect', weight: 5 }],
  'touching everything': [{ persona: 'architect', weight: 5 }],
  'structural': [{ persona: 'architect', weight: 3 }],
  'architecture': [{ persona: 'architect', weight: 3 }],
  'refactor': [{ persona: 'architect', weight: 2 }],
  'performance': [{ persona: 'architect', weight: 2 }],
  
  // Contrarian signals
  'wrong approach': [{ persona: 'contrarian', weight: 4 }],
  'step back': [{ persona: 'contrarian', weight: 3 }],
  'assumption': [{ persona: 'contrarian', weight: 2 }],
  'should we': [{ persona: 'contrarian', weight: 2 }],
  'do nothing': [{ persona: 'contrarian', weight: 2 }]
};

/**
 * Auto-select the best unstuck persona based on problem description
 */
export function autoSelectPersona(problem: string): AutoSelectResult {
  const lower = problem.toLowerCase();
  const scores: Record<UnstuckPersona, number> = {
    hacker: 0,
    researcher: 0,
    simplifier: 0,
    architect: 0,
    contrarian: 0
  };
  const signals: string[] = [];
  
  for (const [pattern, matches] of Object.entries(SIGNAL_PATTERNS)) {
    if (lower.includes(pattern)) {
      signals.push(pattern);
      for (const match of matches) {
        scores[match.persona] += match.weight;
      }
    }
  }
  
  // Find highest scoring persona
  let bestPersona: UnstuckPersona = 'contrarian'; // Default
  let bestScore = 0;
  
  for (const [persona, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestPersona = persona as UnstuckPersona;
    }
  }
  
  // Calculate confidence
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0.2;
  
  return {
    persona: bestPersona,
    confidence: Math.min(confidence, 1),
    signals
  };
}

/**
 * Get strategy for a specific persona
 */
export function getStrategy(persona: UnstuckPersona): UnstuckStrategy {
  return STRATEGIES[persona];
}

/**
 * Get all available personas
 */
export function getAllPersonas(): UnstuckPersona[] {
  return Object.keys(STRATEGIES) as UnstuckPersona[];
}
