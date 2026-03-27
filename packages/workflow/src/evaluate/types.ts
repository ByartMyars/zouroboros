/**
 * Types for three-stage evaluation
 */

export interface MechanicalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SemanticCriterion {
  name: string;
  met: boolean;
  evidence: string;
}

export interface SemanticResult {
  acCompliance: number;
  goalAlignment: number;
  driftScore: number;
  overallScore: number;
  criteria: SemanticCriterion[];
  passed: boolean;
}

export interface ConsensusVote {
  perspective: 'proposer' | 'devils_advocate' | 'synthesizer';
  verdict: 'approve' | 'reject';
  reasoning: string;
}

export interface ConsensusResult {
  votes: ConsensusVote[];
  finalVerdict: 'approve' | 'reject';
  confidence: number;
}

export interface EvaluationReport {
  id: string;
  seedId: string;
  artifactPath: string;
  timestamp: string;
  stage1: {
    passed: boolean;
    checks: MechanicalCheck[];
  };
  stage2: SemanticResult | null;
  stage3: ConsensusResult | null;
  decision: 'approved' | 'needs_work' | 'rejected';
  recommendations: string[];
}

export interface SeedSpec {
  id?: string;
  goal?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
  evaluationPrinciples?: Array<{ name: string; description: string; weight: number }>;
}
