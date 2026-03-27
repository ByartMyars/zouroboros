/**
 * OmniRoute API client for Zouroboros
 * 
 * Handles communication with OmniRoute for combo fetching and model routing.
 */

import type {
  OmniRouteConfig,
  OmniRouteCombo,
  OmniRouteRecommendation,
  TaskType,
  ComplexityTier,
  TaskFitness,
  ComboModel,
} from './types.js';

// ============================================================================
// TASK FITNESS CONFIGURATION
// ============================================================================

const TASK_FITNESS: Record<TaskType, TaskFitness> = {
  coding: { preferred: ["claude", "deepseek", "codex"], traits: ["fast", "code-optimized"] },
  review: { preferred: ["claude", "gemini", "openai"], traits: ["analytical", "thorough"] },
  planning: { preferred: ["gemini", "claude", "openai"], traits: ["reasoning", "structured"] },
  analysis: { preferred: ["gemini", "claude"], traits: ["deep-reasoning", "large-context"] },
  debugging: { preferred: ["claude", "deepseek", "codex"], traits: ["code-aware", "fast"] },
  documentation: { preferred: ["gemini", "claude", "openai"], traits: ["clear", "structured"] },
  general: { preferred: ["gemini", "openrouter"], traits: ["fast", "free", "light"] },
  data_science: { preferred: ["claude", "gemini"], traits: ["analytical", "code-aware"] },
  devops: { preferred: ["claude", "deepseek"], traits: ["infrastructure-aware", "fast"] },
  security: { preferred: ["claude", "gemini"], traits: ["thorough", "analytical"] },
  content: { preferred: ["gemini", "openai"], traits: ["creative", "structured"] },
};

const TIER_CANDIDATES: Record<ComplexityTier, string[]> = {
  trivial: ["light"],
  simple: ["light", "mid"],
  moderate: ["light", "mid", "heavy"],
  complex: ["light", "mid", "heavy", "failover"],
};

// ============================================================================
// CLIENT
// ============================================================================

export class OmniRouteClient {
  private config: OmniRouteConfig;

  constructor(config?: Partial<OmniRouteConfig>) {
    this.config = {
      baseUrl: process.env.OMNIROUTE_URL || process.env.OMNIROUTE_BASE_URL || "http://localhost:20128",
      apiKey: process.env.OMNIROUTE_API_KEY,
      cookie: process.env.OMNIROUTE_COOKIE,
      timeout: 5000,
      ...config,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): OmniRouteConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  setConfig(config: Partial<OmniRouteConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if OmniRoute is reachable
   */
  async health(): Promise<{ healthy: boolean; message: string }> {
    try {
      const response = await this.request('/health', { method: 'GET' });
      if (response.ok) {
        return { healthy: true, message: 'OmniRoute is healthy' };
      }
      return { healthy: false, message: `OmniRoute returned ${response.status}` };
    } catch (error: any) {
      return { healthy: false, message: error.message };
    }
  }

  /**
   * Fetch all available combos from OmniRoute
   */
  async fetchCombos(): Promise<OmniRouteCombo[]> {
    const response = await this.request('/api/combos', { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`OmniRoute /api/combos returned ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * Get the best combo for a given task type and complexity
   */
  async getBestCombo(
    taskType: TaskType,
    complexityTier: ComplexityTier,
    options?: {
      budgetConstraint?: number;
      latencyConstraint?: number;
    }
  ): Promise<OmniRouteRecommendation> {
    const combos = await this.fetchCombos();
    return this.selectBestCombo(combos, taskType, complexityTier, options);
  }

  /**
   * Select the best combo from a list based on task requirements
   */
  selectBestCombo(
    combos: OmniRouteCombo[],
    taskType: TaskType,
    complexityTier: ComplexityTier,
    options?: {
      budgetConstraint?: number;
      latencyConstraint?: number;
    }
  ): OmniRouteRecommendation {
    const fitness = TASK_FITNESS[taskType] || TASK_FITNESS.general;
    const enabled = combos.filter(c => c.enabled !== false);
    const allowedNames = TIER_CANDIDATES[complexityTier];

    const tierCandidates = enabled.filter(c => {
      const name = c.name.toLowerCase();
      return allowedNames.some(allowed => name.includes(allowed));
    });

    const candidates = tierCandidates.length > 0 ? tierCandidates : enabled;

    const scored = candidates.map(combo => {
      const { name, models } = combo;
      let score = 0;

      for (const pref of fitness.preferred) {
        if (models.some((m: ComboModel) => m.provider.toLowerCase().includes(pref))) {
          score += 20;
          break;
        }
      }

      for (const trait of fitness.traits) {
        if (name.toLowerCase().includes(trait)) score += 10;
      }

      const avgCost = models.length > 0
        ? models.reduce((sum: number, m: ComboModel) => sum + (m.inputCostPer1M || 0), 0) / models.length
        : 0;

      if (options?.budgetConstraint && avgCost > options.budgetConstraint) {
        score -= 30;
      }

      if (complexityTier === "complex" && name.includes("heavy")) score += 15;
      if (complexityTier === "trivial" && name.includes("light")) score += 15;
      if (complexityTier === "moderate") {
        if (name.includes("mid")) score += 10;
        if (name.includes("heavy")) score -= 15;
        if (name.includes("light")) score += 10;
      }
      if (complexityTier === "trivial" && name.includes("light")) score += 5;

      const isFree = name.includes("free") ||
        models.every((m: ComboModel) => m.provider.toLowerCase().includes("free"));

      return { combo, score, avgCost, isFree };
    });

    scored.sort((a, b) => b.score - a.score);

    const recommended = scored[0];
    const alternatives = scored.slice(1, 3).map(s => ({
      id: s.combo.id,
      name: s.combo.name,
      tradeoff: s.avgCost < recommended.avgCost ? "cheaper but less capable" : "more capable but pricier",
    }));

    const freeOption = scored.find(s => s.isFree);

    return {
      recommendedCombo: {
        id: recommended.combo.id,
        name: recommended.combo.name,
        reason: `Best fit for ${taskType} (${complexityTier} tier)`,
      },
      alternatives,
      freeAlternative: freeOption
        ? { id: freeOption.combo.id, name: freeOption.combo.name }
        : null,
    };
  }

  /**
   * Send a chat completion request to OmniRoute
   */
  async chatCompletion(
    comboName: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    }
  ): Promise<Response> {
    return this.request('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: comboName,
        messages,
        ...options,
      }),
    });
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> || {}),
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (this.config.cookie) {
      headers['Cookie'] = this.config.cookie;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let defaultClient: OmniRouteClient | null = null;

export function getOmniRouteClient(config?: Partial<OmniRouteConfig>): OmniRouteClient {
  if (!defaultClient) {
    defaultClient = new OmniRouteClient(config);
  }
  return defaultClient;
}

export function resetOmniRouteClient(): void {
  defaultClient = null;
}
