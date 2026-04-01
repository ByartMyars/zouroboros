/**
 * Types for Zouroboros Personas
 * 
 * @module zouroboros-personas/types
 */

export interface PersonaConfig {
  name: string;
  slug: string;
  domain: string;
  description: string;
  expertise: string[];
  requiresApiKey: boolean;
  apiKeyName?: string;
  apiBaseUrl?: string;
  safetyRules: string[];
  capabilities: string[];
  mcpServers?: Array<{
    name: string;
    purpose: string;
  }>;
  skills?: Array<{
    name: string;
    commands: string[];
  }>;
}

export interface IdentityTemplate {
  role: string;
  tone: string[];
  communicationPattern: string[];
  responseFormat: string;
  responsibilities: string[];
  domainExpertise: Record<string, string[]>;
  outputSections: string[];
  toolPreferences: Array<{
    category: string;
    preferred: string;
    whenToUse: string;
  }>;
  boundaries: {
    does: string[];
    doesNot: string[];
  };
  tools: string[];
}

export interface SafetyRule {
  id: string;
  rule: string;
  category: 'safety' | 'compliance' | 'privacy' | 'ethics' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface PersonaTemplate {
  name: string;
  description: string;
  config: PersonaConfig;
  identity: IdentityTemplate;
  prompt: string;
}

export interface AgencyAgent {
  name: string;
  division: string;
  description: string;
  expertise: string[];
  deliverables: string[];
  criticalRules: string[];
  successMetrics: string[];
}

export interface SkillsMPSkill {
  id: string;
  name: string;
  description: string;
  stars: number;
  author: string;
}

export interface PhaseResult {
  phase: number;
  name: string;
  status: 'pending' | 'in-progress' | 'complete' | 'skipped';
  output?: string;
}
