/**
 * Evolution History
 *
 * Track and visualize system improvements over time.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { EvolutionResult, ScorecardSnapshot } from './types.js';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  prescriptionId: string;
  playbookId: string;
  playbookName: string;
  metricName: string;
  baseline: ScorecardSnapshot;
  postFlight: ScorecardSnapshot | null;
  delta: number;
  success: boolean;
  reverted: boolean;
  duration?: number; // ms
  tags: string[];
}

export interface HistoryStats {
  totalEvolutions: number;
  successCount: number;
  failCount: number;
  revertCount: number;
  successRate: number;
  avgDelta: number;
  avgPositiveDelta: number;
  bestEvolution: HistoryEntry | null;
  worstEvolution: HistoryEntry | null;
  streakCurrent: number;
  streakBest: number;
  byMetric: Record<string, { count: number; avgDelta: number; successRate: number }>;
  byPlaybook: Record<string, { count: number; avgDelta: number; successRate: number }>;
}

export interface TrendPoint {
  timestamp: string;
  composite: number;
  metrics: Record<string, number>;
}

interface HistoryStore {
  version: string;
  entries: HistoryEntry[];
  trends: TrendPoint[];
}

export class EvolutionHistory {
  private dataFile: string;
  private store: HistoryStore;
  private maxEntries: number;
  private maxTrends: number;

  constructor(dataDir: string, maxEntries = 1000, maxTrends = 500) {
    mkdirSync(dataDir, { recursive: true });
    this.dataFile = join(dataDir, 'evolution-history.json');
    this.maxEntries = maxEntries;
    this.maxTrends = maxTrends;
    this.store = this.load();
  }

  record(entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
    const id = `evo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: HistoryEntry = { id, ...entry };

    this.store.entries.push(full);
    if (this.store.entries.length > this.maxEntries) {
      this.store.entries = this.store.entries.slice(-this.maxEntries);
    }

    // Add trend point if we have post-flight data
    if (full.postFlight) {
      const metricsMap: Record<string, number> = {};
      for (const m of full.postFlight.metrics) {
        metricsMap[m.name] = m.value;
      }
      this.store.trends.push({
        timestamp: full.timestamp,
        composite: full.postFlight.composite,
        metrics: metricsMap,
      });
      if (this.store.trends.length > this.maxTrends) {
        this.store.trends = this.store.trends.slice(-this.maxTrends);
      }
    }

    this.save();
    return full;
  }

  recordFromResult(
    result: EvolutionResult,
    playbookId: string,
    playbookName: string,
    metricName: string,
    tags: string[] = []
  ): HistoryEntry {
    return this.record({
      timestamp: new Date().toISOString(),
      prescriptionId: result.prescriptionId,
      playbookId,
      playbookName,
      metricName,
      baseline: result.baseline,
      postFlight: result.postFlight,
      delta: result.delta,
      success: result.success,
      reverted: result.reverted,
      tags,
    });
  }

  getStats(): HistoryStats {
    const entries = this.store.entries;
    if (entries.length === 0) {
      return {
        totalEvolutions: 0, successCount: 0, failCount: 0, revertCount: 0,
        successRate: 0, avgDelta: 0, avgPositiveDelta: 0,
        bestEvolution: null, worstEvolution: null,
        streakCurrent: 0, streakBest: 0,
        byMetric: {}, byPlaybook: {},
      };
    }

    const successEntries = entries.filter(e => e.success);
    const failEntries = entries.filter(e => !e.success);
    const revertEntries = entries.filter(e => e.reverted);
    const positiveDeltas = entries.filter(e => e.delta > 0);

    // Streaks
    let currentStreak = 0;
    let bestStreak = 0;
    let streak = 0;
    for (const e of entries) {
      if (e.success) {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    }
    currentStreak = streak;

    // Best/worst
    const sorted = [...entries].sort((a, b) => b.delta - a.delta);

    // By metric
    const byMetric: Record<string, { count: number; totalDelta: number; successes: number }> = {};
    for (const e of entries) {
      if (!byMetric[e.metricName]) {
        byMetric[e.metricName] = { count: 0, totalDelta: 0, successes: 0 };
      }
      byMetric[e.metricName].count++;
      byMetric[e.metricName].totalDelta += e.delta;
      if (e.success) byMetric[e.metricName].successes++;
    }

    // By playbook
    const byPlaybook: Record<string, { count: number; totalDelta: number; successes: number }> = {};
    for (const e of entries) {
      if (!byPlaybook[e.playbookId]) {
        byPlaybook[e.playbookId] = { count: 0, totalDelta: 0, successes: 0 };
      }
      byPlaybook[e.playbookId].count++;
      byPlaybook[e.playbookId].totalDelta += e.delta;
      if (e.success) byPlaybook[e.playbookId].successes++;
    }

    return {
      totalEvolutions: entries.length,
      successCount: successEntries.length,
      failCount: failEntries.length,
      revertCount: revertEntries.length,
      successRate: successEntries.length / entries.length,
      avgDelta: entries.reduce((s, e) => s + e.delta, 0) / entries.length,
      avgPositiveDelta: positiveDeltas.length > 0
        ? positiveDeltas.reduce((s, e) => s + e.delta, 0) / positiveDeltas.length
        : 0,
      bestEvolution: sorted[0] || null,
      worstEvolution: sorted[sorted.length - 1] || null,
      streakCurrent: currentStreak,
      streakBest: bestStreak,
      byMetric: Object.fromEntries(
        Object.entries(byMetric).map(([k, v]) => [k, {
          count: v.count,
          avgDelta: v.totalDelta / v.count,
          successRate: v.successes / v.count,
        }])
      ),
      byPlaybook: Object.fromEntries(
        Object.entries(byPlaybook).map(([k, v]) => [k, {
          count: v.count,
          avgDelta: v.totalDelta / v.count,
          successRate: v.successes / v.count,
        }])
      ),
    };
  }

  getTrends(limit?: number): TrendPoint[] {
    const trends = this.store.trends;
    return limit ? trends.slice(-limit) : [...trends];
  }

  getEntries(options?: { limit?: number; metricName?: string; playbookId?: string; successOnly?: boolean }): HistoryEntry[] {
    let entries = [...this.store.entries];

    if (options?.metricName) {
      entries = entries.filter(e => e.metricName === options.metricName);
    }
    if (options?.playbookId) {
      entries = entries.filter(e => e.playbookId === options.playbookId);
    }
    if (options?.successOnly) {
      entries = entries.filter(e => e.success);
    }

    return entries.slice(-(options?.limit || entries.length));
  }

  getRecentEntries(limit = 10): HistoryEntry[] {
    return this.store.entries.slice(-limit);
  }

  clear(): void {
    this.store = { version: '1.0.0', entries: [], trends: [] };
    this.save();
  }

  private load(): HistoryStore {
    if (existsSync(this.dataFile)) {
      try {
        return JSON.parse(readFileSync(this.dataFile, 'utf-8'));
      } catch { /* fall through */ }
    }
    return { version: '1.0.0', entries: [], trends: [] };
  }

  private save(): void {
    writeFileSync(this.dataFile, JSON.stringify(this.store, null, 2));
  }
}

export function createEvolutionHistory(dataDir: string): EvolutionHistory {
  return new EvolutionHistory(dataDir);
}
