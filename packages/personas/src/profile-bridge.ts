/**
 * Profile Bridge — connects persona analytics to memory cognitive profiles.
 *
 * Uses dependency injection so the personas package doesn't need a direct
 * dependency on zouroboros-memory. The caller provides profile accessors.
 */

import type { PersonaMetrics, SessionEvent } from './analytics.js';
import { PersonaAnalytics } from './analytics.js';

/** Minimal interface matching memory profiles API */
export interface ProfileAccessor {
  updateTraits(entity: string, traits: Record<string, number>): void;
  updatePreferences(entity: string, preferences: Record<string, string>): void;
  recordInteraction(entity: string, type: 'query' | 'store' | 'search', success: boolean, latencyMs: number): void;
  getProfileSummary(entity: string): { entity: string; totalInteractions: number; successRate: number; avgLatencyMs: number; traitCount: number; preferenceCount: number } | null;
}

export interface ProfileBridgeConfig {
  /** Sync interval in ms (default: 60000) */
  syncInterval?: number;
  /** Map persona analytics traits to profile traits */
  traitMapper?: (metrics: PersonaMetrics) => Record<string, number>;
}

const DEFAULT_TRAIT_MAPPER = (metrics: PersonaMetrics): Record<string, number> => ({
  task_completion_rate: metrics.taskCompletionRate,
  error_rate: metrics.errorRate,
  switch_away_rate: metrics.switchAwayRate,
  avg_session_duration_s: metrics.avgSessionDuration / 1000,
  total_sessions: metrics.totalSessions,
});

/**
 * Bridges persona analytics events to memory cognitive profiles.
 *
 * Call `sync()` periodically or after batch operations to push
 * persona effectiveness metrics into the memory profile system.
 */
export class ProfileBridge {
  private analytics: PersonaAnalytics;
  private profiles: ProfileAccessor;
  private traitMapper: (metrics: PersonaMetrics) => Record<string, number>;

  constructor(analytics: PersonaAnalytics, profiles: ProfileAccessor, config?: ProfileBridgeConfig) {
    this.analytics = analytics;
    this.profiles = profiles;
    this.traitMapper = config?.traitMapper ?? DEFAULT_TRAIT_MAPPER;
  }

  /**
   * Sync all persona metrics to their corresponding memory profiles.
   * Returns the number of profiles updated.
   */
  sync(): number {
    const allMetrics = this.analytics.getAllMetrics();
    let updated = 0;

    for (const metrics of allMetrics) {
      const entity = `persona:${metrics.slug}`;
      const traits = this.traitMapper(metrics);
      this.profiles.updateTraits(entity, traits);

      // Store top tools as preferences
      const topTools = Object.entries(metrics.toolUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      if (topTools.length > 0) {
        const prefs: Record<string, string> = {};
        for (const [tool, count] of topTools) {
          prefs[`preferred_tool_${tool}`] = String(count);
        }
        this.profiles.updatePreferences(entity, prefs);
      }

      // Store domain breakdown as preferences
      for (const [domain, count] of Object.entries(metrics.domainBreakdown)) {
        this.profiles.updatePreferences(entity, { [`domain_${domain}`]: String(count) });
      }

      updated++;
    }

    return updated;
  }

  /**
   * Sync a single persona's metrics to its memory profile.
   */
  syncPersona(slug: string): boolean {
    const metrics = this.analytics.getMetrics(slug);
    if (!metrics) return false;

    const entity = `persona:${slug}`;
    this.profiles.updateTraits(entity, this.traitMapper(metrics));
    return true;
  }

  /**
   * Get a combined view of persona analytics + memory profile data.
   */
  getCombinedReport(slug: string): {
    analytics: PersonaMetrics;
    profile: { totalInteractions: number; successRate: number; avgLatencyMs: number } | null;
  } | null {
    const metrics = this.analytics.getMetrics(slug);
    if (!metrics) return null;

    const profile = this.profiles.getProfileSummary(`persona:${slug}`);
    return {
      analytics: metrics,
      profile: profile ? {
        totalInteractions: profile.totalInteractions,
        successRate: profile.successRate,
        avgLatencyMs: profile.avgLatencyMs,
      } : null,
    };
  }
}

export function createProfileBridge(
  analytics: PersonaAnalytics,
  profiles: ProfileAccessor,
  config?: ProfileBridgeConfig
): ProfileBridge {
  return new ProfileBridge(analytics, profiles, config);
}
