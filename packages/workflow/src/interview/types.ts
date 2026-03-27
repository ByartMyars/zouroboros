/**
 * Types for spec-first interview
 */

export interface InterviewConfig {
  topic: string;
  outputDir: string;
  maxQuestions?: number;
}

export interface AmbiguityScore {
  goal: number;
  constraints: number;
  success: number;
  ambiguity: number;
  assessment: string;
}

export interface SeedSpecification {
  id: string;
  created: string;
  status: 'draft' | 'approved' | 'rejected';
  goal: string;
  constraints: string[];
  acceptanceCriteria: string[];
  ontology: {
    name: string;
    description: string;
    fields: Array<{
      name: string;
      type: string;
      description: string;
    }>;
  };
  evaluationPrinciples: Array<{
    name: string;
    description: string;
    weight: number;
  }>;
  exitConditions: Array<{
    name: string;
    description: string;
    criteria: string;
  }>;
}

export interface InterviewSession {
  id: string;
  topic: string;
  questions: string[];
  answers: string[];
  timestamp: number;
}
