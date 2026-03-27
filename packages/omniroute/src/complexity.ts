/**
 * Complexity analysis for OmniRoute routing
 * 
 * Analyzes task text to determine complexity tier, task type, and routing signals.
 */

import type {
  ComplexityTier,
  ComplexitySignal,
  ComplexityEstimate,
  TaskType,
  SemanticMatch,
  DomainPattern,
  ConstraintSpec,
  ConstraintType,
  ConstraintValue,
  ScopeModifier,
  WeightConfig,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TIER_TO_COMBO: Record<ComplexityTier, string> = {
  trivial: "light",
  simple: "light",
  moderate: "mid",
  complex: "heavy",
};

export const TIER_CANDIDATES: Record<ComplexityTier, string[]> = {
  trivial: ["light"],
  simple: ["light", "mid"],
  moderate: ["light", "mid", "heavy"],
  complex: ["light", "mid", "heavy", "failover"],
};

const TIER_ORDER: Record<ComplexityTier, number> = { trivial: 0, simple: 1, moderate: 2, complex: 3 };

const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  debugging: ["debug", "bug", "error", "crash", "broken", "stacktrace", "exception", "failure", "troubleshoot", "diagnose", "memory leak", "race condition", "deadlock"],
  analysis: ["analyze", "analyse", "assess", "evaluate", "audit", "investigate", "research", "compare", "examine", "inspect", "study", "explore", "benchmark", "measure", "profile"],
  review: ["review", "pr", "pull request", "code review", "diff", "feedback", "critique", "assess code", "examine code"],
  planning: ["plan", "design", "architect", "roadmap", "strategy", "outline", "proposal", "rfc", "spec", "blueprint", "scheme"],
  documentation: ["document", "readme", "docs", "write up", "explain", "tutorial", "guide", "manual", "howto", "walkthrough"],
  coding: ["implement", "build", "create", "write", "code", "develop", "add", "refactor", "migrate", "deploy", "construct", "program"],
  data_science: ["model", "train", "dataset", "ml", "machine learning", "ai", "neural", "pandas", "numpy", "scikit", "tensorflow", "pytorch", "data analysis", "predict", "classification", "regression"],
  devops: ["deploy", "ci", "cd", "pipeline", "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins", "github actions", "infrastructure", "provision", "orchestrate"],
  security: ["security", "vulnerability", "cve", "exploit", "penetration", "compliance", "gdpr", "hipaa", "pci", "sox", "encryption", "owasp", "xss", "sql injection", "gdpr compliance", "security audit", "penetration testing"],
  content: ["write", "blog", "article", "post", "copy", "content", "marketing", "seo", "draft", "compose"],
  general: [],
};

const TECH_STACK_PATTERNS: Record<string, RegExp> = {
  react: /\b(react|jsx|tsx|next\.?js)\b/i,
  vue: /\b(vue|vuex|nuxt)\b/i,
  angular: /\b(angular|ng)\b/i,
  node: /\b(node\.?js|express|fastify|koa)\b/i,
  python: /\b(python|django|flask|fastapi)\b/i,
  docker: /\b(docker|container|dockerfile)\b/i,
  kubernetes: /\b(k8s|kubernetes|kubectl|helm)\b/i,
  terraform: /\b(terraform|tf|hcl)\b/i,
  aws: /\b(aws|ec2|s3|lambda|cloudfront)\b/i,
  gcp: /\b(gcp|google cloud|bigquery)\b/i,
  azure: /\b(azure|azuread)\b/i,
  postgres: /\b(postgres|postgresql|pg)\b/i,
  mongodb: /\b(mongo|mongodb)\b/i,
  redis: /\b(redis|cache)\b/i,
  graphql: /\b(graphql|gql)\b/i,
  grpc: /\b(grpc|protobuf)\b/i,
  oauth: /\b(oauth|oauth2|openid|oidc)\b/i,
  jwt: /\b(jwt|json web token)\b/i,
  auth: /\b(authentication|authorization|mfa|2fa|totp|saml|sso)\b/i,
  security: /\b(security|encrypt|decrypt|vulnerability|penetration|xss|csrf|injection)\b/i,
};

const SCOPE_MODIFIER_PATTERNS: Record<ScopeModifier, RegExp> = {
  quick: /\b(quick|fast|rapid|asap|urgent|immediate|briefly)\b/i,
  thorough: /\b(thorough|comprehensive|complete|detailed|exhaustive|in-depth|careful)\b/i,
  experimental: /\b(experiment|prototype|poc|proof of concept|spike|explore|try)\b/i,
  production: /\b(production|prod|live|deploy|release|ship)\b/i,
};

const CONSTRAINT_PATTERNS: Record<ConstraintType, Record<ConstraintValue, RegExp>> = {
  budget: {
    low: /\b(cheap|free|low cost|budget|economical|inexpensive|minimal cost)\b/i,
    medium: /\b(reasonable cost|moderate budget|standard pricing)\b/i,
    high: /\b(premium|expensive|high cost|no budget limit|unlimited budget)\b/i,
  },
  latency: {
    low: /\b(fast|quick|immediate|instant|low latency|responsive)\b/i,
    medium: /\b(normal speed|moderate latency|reasonable time)\b/i,
    high: /\b(slow|batch|background|can wait|high latency ok)\b/i,
  },
  quality: {
    low: /\b(draft|rough|quick pass|good enough|acceptable)\b/i,
    medium: /\b(standard quality|production ready|professional)\b/i,
    high: /\b(perfect|flawless|highest quality|thorough|comprehensive)\b/i,
  },
  speed: {
    low: /\b(slow|careful|methodical|deliberate)\b/i,
    medium: /\b(normal pace|standard speed)\b/i,
    high: /\b(fast|quick|rapid|urgent|asap|immediate)\b/i,
  },
};

const DEFAULT_WEIGHTS: WeightConfig = {
  version: 1,
  lastUpdated: Date.now(),
  feedbackCount: 0,
  weights: {
    wordCount: 0.04,
    fileRefs: 0.02,
    multiStep: 0.10,
    toolUsage: 0.04,
    analysisDepth: 0.08,
    conceptCount: 0.20,
    taskVerbComplexity: 0.10,
    scopeBreadth: 0.12,
    featureListCount: 0.20,
  },
  performance: {
    precision: { trivial: 0, simple: 0, moderate: 0, complex: 0 },
    recall: { trivial: 0, simple: 0, moderate: 0, complex: 0 },
    f1: { trivial: 0, simple: 0, moderate: 0, complex: 0 },
  },
};

// ============================================================================
// SIGNAL COMPUTATION
// ============================================================================

function normalizeLinear(value: number, min: number, max: number): number {
  if (value <= min) return 0;
  if (value >= max) return 1;
  return (value - min) / (max - min);
}

function normalizeLog(value: number, base: number = 10): number {
  if (value <= 1) return 0;
  return Math.min(1, Math.log(value) / Math.log(base));
}

function computeStringSimilarity(a: string, b: string): number {
  const ngrams = (s: string, n: number = 3): Set<string> => {
    const grams = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) {
      grams.add(s.slice(i, i + n));
    }
    return grams;
  };

  const gramsA = ngrams(a.toLowerCase());
  const gramsB = ngrams(b.toLowerCase());

  const intersection = new Set([...gramsA].filter(x => gramsB.has(x)));
  const union = new Set([...gramsA, ...gramsB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

export function computeSignals(text: string, weights: WeightConfig): ComplexitySignal[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const fileRefs = (lower.match(/\/[\w\-./ ]+\.\w+/g) || []).length;

  // Multi-step detection
  const stepMarkers = (lower.match(/\b(then|after|next|step \d+|finally|first|second|third|fourth|fifth)\b/g) || []).length;
  const numberedSteps = (lower.match(/\d+\.\s/g) || []).length;
  const commaItems = (lower.match(/,\s*(?:and\s+)?/g) || []).length;
  const sentences = text.match(/\.\s+[A-Z]/g)?.length || 0;
  const multiStepIntensity = stepMarkers + numberedSteps + commaItems + sentences;

  // Tool usage depth
  const tools = lower.match(/\b(git|npm|bun|pip|curl|sed|grep|awk|mkdir|chmod|docker|kubectl|terraform|ansible|webpack|vite|jest|pytest|make|cmake)\b/g) || [];
  const toolUsageDepth = tools.length;

  // Analysis depth
  const analysisKeywords = lower.match(/\b(analy[zs]e|assess|evaluate|audit|investigate|research|compare|examine|inspect|suggest|optimize|recommend|improve|bottleneck|performance|diagnose|troubleshoot|review|measure)\b/g) || [];
  const analysisDepth = analysisKeywords.length;

  // Concept count - distinct technical concepts
  const conceptPatterns = lower.match(/\b(api|gateway|service|mesh|auth|authentication|authorization|oauth|jwt|token|database|cache|queue|worker|scheduler|load.?balancer|proxy|middleware|controller|model|view|schema|migration|endpoint|webhook|socket|websocket|stream|pipeline|microservice|monolith|container|cluster|node|pod|replica|deployment|ingress|certificate|ssl|tls|encryption|hashing|session|cookie|cors|csrf|rate.?limit|throttl|pagination|search|index|shard|backup|restore|monitor|alert|log|metric|trace|dashboard|chart|graph|notification|email|sms|push|cron|job|task|event|message|pub.?sub|kafka|rabbit|redis|memcache|cdn|dns|domain|route|network|firewall|vpc|subnet|security.?group|iam|role|policy|permission|mfa|2fa|totp|saml|sso|ldap|refresh|rotation|testing|unit.?test|integration.?test|e2e|ci|cd|pipeline|build|deploy|release|rollback|canary|blue.?green|feature.?flag|a.?b.?test|compliance|gdpr|hipaa|pci|workflow|codebase|real.?time|chat|presence|persistence|receipt|inventory|payment|order|admin|visualization|report|landing.?page|form|contact|navigation|prototype|poc|neural|dataset|training|inference|prometheus|grafana|terraform|helm|ingress|typescript|javascript|react|angular|vue|fastapi|django|flask|express)\b/g) || [];
  const uniqueConcepts = new Set(conceptPatterns);
  const conceptCount = uniqueConcepts.size;

  // Task verb complexity
  const actionVerbs = lower.match(/\b(implement|build|create|write|develop|design|architect|plan|deploy|test|debug|fix|refactor|migrate|optimize|analyze|review|audit|configure|setup|install|integrate|automate|monitor|scale|secure|document|benchmark|profile|validate|verify)\b/g) || [];
  const uniqueVerbs = new Set(actionVerbs);
  const taskVerbComplexity = uniqueVerbs.size;

  // Scope breadth
  const broadScope = (lower.match(/\b(entire|full|comprehensive|all|system|platform|architecture|infrastructure|end.?to.?end|cross.?cutting|enterprise|organization|codebase|stack|ecosystem|framework|suite|pipeline|across|every|workflow)\b/g) || []).length;
  const narrowScope = (lower.match(/\b(function|method|button|field|typo|variable|parameter|class|component|element|line|column|property|attribute|simple|single|one|quick|small|minor|tiny)\b/g) || []).length;
  const scopeScore = Math.max(0, broadScope - narrowScope);

  // Feature enumeration
  const commaAndItems = lower.split(/,\s*(?:and\s+)?|(?:\band\b)/).length;
  const featureListCount = Math.max(0, commaAndItems - 1);

  return [
    {
      name: "wordCount",
      rawValue: wordCount,
      normalizedScore: normalizeLinear(wordCount, 5, 80),
      weight: weights.weights.wordCount || 0.05,
    },
    {
      name: "fileRefs",
      rawValue: fileRefs,
      normalizedScore: normalizeLog(fileRefs, 5),
      weight: weights.weights.fileRefs || 0.03,
    },
    {
      name: "multiStep",
      rawValue: multiStepIntensity,
      normalizedScore: normalizeLinear(multiStepIntensity, 0, 6),
      weight: weights.weights.multiStep || 0.12,
    },
    {
      name: "toolUsage",
      rawValue: toolUsageDepth,
      normalizedScore: normalizeLog(toolUsageDepth, 5),
      weight: weights.weights.toolUsage || 0.05,
    },
    {
      name: "analysisDepth",
      rawValue: analysisDepth,
      normalizedScore: normalizeLinear(analysisDepth, 0, 3),
      weight: weights.weights.analysisDepth || 0.10,
    },
    {
      name: "conceptCount",
      rawValue: conceptCount,
      normalizedScore: normalizeLinear(conceptCount, 0, 6),
      weight: weights.weights.conceptCount || 0.25,
    },
    {
      name: "taskVerbComplexity",
      rawValue: taskVerbComplexity,
      normalizedScore: normalizeLinear(taskVerbComplexity, 0, 4),
      weight: weights.weights.taskVerbComplexity || 0.20,
    },
    {
      name: "scopeBreadth",
      rawValue: scopeScore,
      normalizedScore: normalizeLinear(scopeScore, 0, 3),
      weight: weights.weights.scopeBreadth || 0.12,
    },
    {
      name: "featureListCount",
      rawValue: featureListCount,
      normalizedScore: normalizeLinear(featureListCount, 0, 4),
      weight: weights.weights.featureListCount || 0.20,
    },
  ];
}

// ============================================================================
// SEMANTIC ANALYSIS
// ============================================================================

export function inferTaskTypeSemantic(text: string): SemanticMatch {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  let bestMatch: SemanticMatch = {
    taskType: "general",
    confidence: 0,
    matchMethod: "keyword",
    evidenceTokens: [],
  };

  for (const [taskType, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (taskType === "general") continue;

    // Keyword matching
    const keywordMatches = keywords.filter(kw => lower.includes(kw));
    if (keywordMatches.length > 0) {
      const SPECIALIZATION_BONUS: Partial<Record<string, number>> = {
        security: 0.05, data_science: 0.05, devops: 0.05, analysis: 0.02, planning: 0.02,
      };
      const bonus = keywordMatches.length >= 2 ? (SPECIALIZATION_BONUS[taskType] || 0) : 0;
      const confidence = Math.min(1.0, keywordMatches.length * 0.3 + bonus);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          taskType: taskType as TaskType,
          confidence,
          matchMethod: "keyword",
          evidenceTokens: keywordMatches,
        };
      }
    }

    // Shallow semantic (synonym matching)
    for (const word of words) {
      for (const keyword of keywords) {
        const similarity = computeStringSimilarity(word, keyword);
        if (similarity > 0.7) {
          const confidence = Math.min(1.0, similarity * 0.5);
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              taskType: taskType as TaskType,
              confidence,
              matchMethod: "synonym",
              evidenceTokens: [word, keyword],
            };
          }
        }
      }
    }
  }

  // Contextual semantic (multi-word combinations)
  for (const [taskType, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (taskType === "general") continue;

    for (const keyword of keywords) {
      if (keyword.includes(" ")) {
        if (lower.includes(keyword)) {
          const confidence = 0.9;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              taskType: taskType as TaskType,
              confidence,
              matchMethod: "contextual",
              evidenceTokens: [keyword],
            };
          }
        }
      }
    }
  }

  return bestMatch;
}

export function detectDomainPattern(text: string, taskType: TaskType): DomainPattern | null {
  const lower = text.toLowerCase();
  const detectedTech: string[] = [];

  for (const [tech, pattern] of Object.entries(TECH_STACK_PATTERNS)) {
    if (pattern.test(lower)) {
      detectedTech.push(tech);
    }
  }

  let domain = taskType;
  let subdomain: string | null = null;
  let complexityModifier = 1.0;

  // Subdomain detection for coding
  if (taskType === "coding") {
    if (/\b(frontend|ui|ux|component|view|client|spa)\b/i.test(lower)) {
      subdomain = "frontend";
      complexityModifier = 1.1;
    } else if (/\b(backend|api|server|database|db|endpoint)\b/i.test(lower)) {
      subdomain = "backend";
      complexityModifier = 1.2;
    } else if (/\b(infrastructure|infra|devops|deploy|ci|cd|pipeline)\b/i.test(lower)) {
      subdomain = "infrastructure";
      complexityModifier = 1.3;
    } else if (/\b(auth|security|encrypt|vulnerability|login|signup)\b/i.test(lower)) {
      subdomain = "security";
      complexityModifier = 1.4;
    }
  }

  // Tech stack complexity modifiers
  if (detectedTech.includes("kubernetes") || detectedTech.includes("terraform")) {
    complexityModifier *= 1.3;
  }
  if (detectedTech.includes("pytorch") || detectedTech.includes("tensorflow")) {
    complexityModifier *= 1.2;
  }
  if (detectedTech.includes("oauth") || detectedTech.includes("jwt") || detectedTech.includes("auth")) {
    complexityModifier *= 1.2;
  }

  // Baseline complexity for non-trivial task types
  if (!subdomain && detectedTech.length === 0) {
    if (taskType === "planning" || taskType === "analysis") {
      complexityModifier = 1.1;
    }
    if (taskType === "security" || taskType === "devops" || taskType === "data_science") {
      complexityModifier = 1.2;
    }
  }

  if (detectedTech.length === 0 && !subdomain && taskType === "general") return null;

  return {
    domain,
    subdomain,
    techStack: detectedTech,
    complexityModifier,
  };
}

// ============================================================================
// CONSTRAINT DETECTION
// ============================================================================

export function detectConstraints(
  text: string,
  cliConstraints?: Partial<Record<ConstraintType, ConstraintValue>>
): ConstraintSpec[] {
  const constraints: ConstraintSpec[] = [];

  // Explicit constraints from CLI (highest priority)
  if (cliConstraints) {
    let priority = 100;
    for (const [type, value] of Object.entries(cliConstraints)) {
      constraints.push({
        type: type as ConstraintType,
        value: value as ConstraintValue,
        source: "explicit",
        priority: priority--,
      });
    }
  }

  // Inferred constraints from text (medium priority)
  const lower = text.toLowerCase();
  let priority = 50;
  for (const [type, valuePatterns] of Object.entries(CONSTRAINT_PATTERNS)) {
    for (const [value, pattern] of Object.entries(valuePatterns)) {
      if (pattern.test(lower)) {
        constraints.push({
          type: type as ConstraintType,
          value: value as ConstraintValue,
          source: "inferred",
          priority: priority--,
        });
        break;
      }
    }
  }

  // Default constraints (lowest priority)
  const defaultTypes: ConstraintType[] = ["budget", "latency", "quality", "speed"];
  const existingTypes = new Set(constraints.map(c => c.type));
  priority = 10;
  for (const type of defaultTypes) {
    if (!existingTypes.has(type)) {
      constraints.push({
        type,
        value: "medium",
        source: "default",
        priority: priority--,
      });
    }
  }

  return constraints.sort((a, b) => b.priority - a.priority);
}

export function detectScopeModifier(text: string): ScopeModifier | null {
  for (const [modifier, pattern] of Object.entries(SCOPE_MODIFIER_PATTERNS)) {
    if (pattern.test(text)) {
      return modifier as ScopeModifier;
    }
  }
  return null;
}

// ============================================================================
// TIER CALCULATION
// ============================================================================

export function calculateTier(
  signals: ComplexitySignal[],
  domainPattern: DomainPattern | null,
  constraints: ConstraintSpec[],
  scopeModifier: ScopeModifier | null,
  taskType: TaskType = "general",
): { tier: ComplexityTier; score: number } {
  // Weighted sum of normalized signals
  let weightedScore = 0;
  for (const signal of signals) {
    weightedScore += signal.normalizedScore * signal.weight;
  }

  // Apply domain complexity modifier
  if (domainPattern) {
    const domainAdjustment = (domainPattern.complexityModifier - 1.0) * 0.2;
    weightedScore += domainAdjustment;
  }

  // Apply scope modifier
  if (scopeModifier) {
    if (scopeModifier === "quick") weightedScore -= 0.15;
    if (scopeModifier === "thorough") weightedScore += 0.15;
    if (scopeModifier === "experimental") weightedScore -= 0.10;
    if (scopeModifier === "production") weightedScore += 0.10;
  }

  // Apply constraint adjustments
  for (const constraint of constraints) {
    if (constraint.type === "budget" && constraint.value === "low") {
      weightedScore -= 0.10;
    }
    if (constraint.type === "speed" && constraint.value === "high") {
      weightedScore -= 0.12;
    }
    if (constraint.type === "quality" && constraint.value === "high") {
      weightedScore += 0.12;
    }
  }

  // Clamp score to [0, 1]
  weightedScore = Math.max(0, Math.min(1, weightedScore));

  // Map to tier
  let tier: ComplexityTier;
  if (weightedScore < 0.08) tier = "trivial";
  else if (weightedScore < 0.20) tier = "simple";
  else if (weightedScore < 0.40) tier = "moderate";
  else tier = "complex";

  // Task-type complexity floor
  if (scopeModifier !== "quick" && scopeModifier !== "experimental") {
    const FLOOR_MAP: Partial<Record<TaskType, ComplexityTier>> = {
      security: "moderate",
      devops: "moderate",
      data_science: "moderate",
      debugging: "simple",
      planning: "simple",
      analysis: "moderate",
    };
    const floor = FLOOR_MAP[taskType];
    if (floor && TIER_ORDER[tier] < TIER_ORDER[floor]) {
      tier = floor;
    }
  }

  return { tier, score: weightedScore };
}

// ============================================================================
// MAIN ESTIMATION
// ============================================================================

export function estimateComplexity(
  text: string,
  options?: {
    budget?: ConstraintValue;
    latency?: ConstraintValue;
    quality?: ConstraintValue;
    speed?: ConstraintValue;
  }
): ComplexityEstimate {
  const weights = DEFAULT_WEIGHTS;
  
  const signals = computeSignals(text, weights);
  const semanticMatch = inferTaskTypeSemantic(text);
  const taskType = semanticMatch.taskType;
  const domainPattern = detectDomainPattern(text, taskType);
  const constraints = detectConstraints(text, options);
  const scopeModifier = detectScopeModifier(text);

  const { tier, score } = calculateTier(
    signals,
    domainPattern,
    constraints,
    scopeModifier,
    taskType
  );

  return {
    tier,
    score,
    signals,
    inferredTaskType: taskType,
    semanticMatch,
    domainPattern,
    constraints,
    scopeModifier,
  };
}
