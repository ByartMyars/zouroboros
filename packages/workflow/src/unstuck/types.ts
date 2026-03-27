/**
 * Types for unstuck lateral thinking
 */

export type UnstuckPersona = 'hacker' | 'researcher' | 'simplifier' | 'architect' | 'contrarian';

export interface UnstuckStrategy {
  persona: UnstuckPersona;
  name: string;
  philosophy: string;
  approach: string[];
  bestFor: string[];
}

export interface UnstuckSession {
  id: string;
  problem: string;
  selectedPersona: UnstuckPersona;
  timestamp: number;
  suggestions: string[];
}

export interface AutoSelectResult {
  persona: UnstuckPersona;
  confidence: number;
  signals: string[];
}
