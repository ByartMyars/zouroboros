/**
 * OmniRoute integration types for Zouroboros
 * 
 * @module zouroboros-omniroute/types
 */

export type ComplexityTier = "trivial" | "simple" | "moderate" | "complex";
export type TaskType = "coding" | "review" | "planning" | "analysis" | "debugging" | "documentation" | "general" | "data_science" | "devops" | "security" | "content";
export type ConstraintType = "budget" | "latency" | "quality" | "speed";
export type ConstraintValue = "low" | "medium" | "high";
export type ConstraintSource = "explicit" | "inferred" | "default";
export type ScopeModifier = "quick" | "thorough" | "experimental" | "production";

export interface ComplexitySignal {
  name: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
}

export interface ConstraintSpec {
  type: ConstraintType;
  value: ConstraintValue;
  source: ConstraintSource;
  priority: number;
}

export interface DomainPattern {
  domain: string;
  subdomain: string | null;
  techStack: string[];
  complexityModifier: number;
}

export interface SemanticMatch {
  taskType: TaskType;
  confidence: number;
  matchMethod: "keyword" | "synonym" | "contextual";
  evidenceTokens: string[];
}

export interface ComplexityEstimate {
  tier: ComplexityTier;
  score: number;
  signals: ComplexitySignal[];
  inferredTaskType: TaskType;
  semanticMatch: SemanticMatch;
  domainPattern: DomainPattern | null;
  constraints: ConstraintSpec[];
  scopeModifier: ScopeModifier | null;
  _legacy?: {
    wordCount: number;
    fileCount: number;
    hasMultiStep: boolean;
    hasTool: boolean;
    hasAnalysis: boolean;
  };
}

export interface ComboModel {
  provider: string;
  model: string;
  inputCostPer1M: number;
}

export interface OmniRouteCombo {
  id: string;
  name: string;
  description?: string;
  models: ComboModel[];
  enabled: boolean;
  traits?: string[];
}

export interface OmniRouteRecommendation {
  recommendedCombo: { id: string; name: string; reason: string };
  alternatives: { id: string; name: string; tradeoff: string }[];
  freeAlternative: { id: string; name: string } | null;
}

export interface OmniRouteConfig {
  baseUrl: string;
  apiKey?: string;
  cookie?: string;
  timeout: number;
}

export interface RoutingOptions {
  taskText: string;
  budget?: ConstraintValue;
  latency?: ConstraintValue;
  quality?: ConstraintValue;
  speed?: ConstraintValue;
  useOmniRoute?: boolean;
}

export interface RoutingResult {
  tier: ComplexityTier;
  score: number;
  taskType: TaskType;
  resolvedCombo: string;
  omniRouteRecommendation: OmniRouteRecommendation | null;
  signals: ComplexitySignal[];
  domainPattern: DomainPattern | null;
  constraints: ConstraintSpec[];
  scopeModifier: ScopeModifier | null;
  performanceMs: number;
}

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  taskText: string;
  recommendedTier: ComplexityTier;
  recommendedCombo: string;
  actualTier?: ComplexityTier;
  correctedTier?: ComplexityTier;
  signals: ComplexitySignal[];
  outcome?: "success" | "failure" | "unknown";
}

export interface WeightConfig {
  version: number;
  lastUpdated: number;
  feedbackCount: number;
  weights: Record<string, number>;
  performance: {
    precision: Record<ComplexityTier, number>;
    recall: Record<ComplexityTier, number>;
    f1: Record<ComplexityTier, number>;
  };
}

export interface TaskFitness {
  preferred: string[];
  traits: string[];
}
