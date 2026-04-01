/**
 * Feedback Loop Tuning
 *
 * Auto-adjusts metric weights based on evolution outcomes.
 * Learns which metrics are most predictive of successful improvements.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { EvolutionResult, MetricResult } from './types.js';

export interface WeightConfig {
  weights: Record<string, number>;
  learningRate: number;
  minWeight: number;
  maxWeight: number;
  version: number;
  lastUpdated: string;
}

export interface FeedbackRecord {
  timestamp: string;
  metricName: string;
  prescriptionId: string;
  baselineScore: number;
  postFlightScore: number | null;
  delta: number;
  success: boolean;
  weightBefore: number;
  weightAfter: number;
}

interface FeedbackStore {
  records: FeedbackRecord[];
  weightHistory: Array<{ timestamp: string; weights: Record<string, number>; trigger: string }>;
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  'Memory Recall': 0.20,
  'Graph Connectivity': 0.15,
  'Routing Accuracy': 0.20,
  'Eval Calibration': 0.15,
  'Procedure Freshness': 0.15,
  'Episode Velocity': 0.15,
};

export class FeedbackTuner {
  private weightsFile: string;
  private storeFile: string;
  private config: WeightConfig;
  private store: FeedbackStore;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.weightsFile = join(dataDir, 'metric-weights.json');
    this.storeFile = join(dataDir, 'feedback-store.json');
    this.config = this.loadWeights();
    this.store = this.loadStore();
  }

  get weights(): Record<string, number> {
    return { ...this.config.weights };
  }

  get version(): number {
    return this.config.version;
  }

  recordOutcome(metric: MetricResult, result: EvolutionResult): FeedbackRecord {
    const weightBefore = this.config.weights[metric.name] || 0.10;
    let weightAfter = weightBefore;

    if (result.success && result.delta !== 0) {
      // Successful evolution — adjust weight based on impact
      const impactMagnitude = Math.abs(result.delta);

      if (result.delta > 0) {
        // Positive improvement — slightly increase weight (reward productive metrics)
        weightAfter = weightBefore + this.config.learningRate * impactMagnitude;
      } else {
        // Regression despite "success" — decrease weight
        weightAfter = weightBefore - this.config.learningRate * impactMagnitude;
      }
    } else if (!result.success) {
      // Failed evolution — slightly decrease weight (this metric led to bad outcomes)
      weightAfter = weightBefore - this.config.learningRate * 0.5;
    }

    // Clamp
    weightAfter = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, weightAfter));

    const record: FeedbackRecord = {
      timestamp: new Date().toISOString(),
      metricName: metric.name,
      prescriptionId: result.prescriptionId,
      baselineScore: metric.score,
      postFlightScore: result.postFlight?.composite ?? null,
      delta: result.delta,
      success: result.success,
      weightBefore,
      weightAfter,
    };

    // Apply weight change
    this.config.weights[metric.name] = weightAfter;
    this.normalizeWeights();
    this.config.version++;
    this.config.lastUpdated = record.timestamp;

    // Store record
    this.store.records.push(record);
    if (this.store.records.length > 500) {
      this.store.records = this.store.records.slice(-500);
    }

    // Store weight snapshot
    this.store.weightHistory.push({
      timestamp: record.timestamp,
      weights: { ...this.config.weights },
      trigger: `${metric.name}: ${result.success ? 'success' : 'fail'} (delta=${result.delta.toFixed(4)})`,
    });
    if (this.store.weightHistory.length > 100) {
      this.store.weightHistory = this.store.weightHistory.slice(-100);
    }

    this.save();
    return record;
  }

  getWeightForMetric(name: string): number {
    return this.config.weights[name] || 0.10;
  }

  getHistory(limit = 20): FeedbackRecord[] {
    return this.store.records.slice(-limit);
  }

  getWeightHistory(limit = 20): Array<{ timestamp: string; weights: Record<string, number>; trigger: string }> {
    return this.store.weightHistory.slice(-limit);
  }

  getSuccessRate(metricName?: string): number {
    const records = metricName
      ? this.store.records.filter(r => r.metricName === metricName)
      : this.store.records;

    if (records.length === 0) return 0;
    return records.filter(r => r.success).length / records.length;
  }

  getAvgDelta(metricName?: string): number {
    const records = metricName
      ? this.store.records.filter(r => r.metricName === metricName)
      : this.store.records;

    if (records.length === 0) return 0;
    return records.reduce((sum, r) => sum + r.delta, 0) / records.length;
  }

  resetWeights(): void {
    this.config.weights = { ...DEFAULT_WEIGHTS };
    this.config.version++;
    this.config.lastUpdated = new Date().toISOString();
    this.save();
  }

  private normalizeWeights(): void {
    const total = Object.values(this.config.weights).reduce((s, w) => s + w, 0);
    if (total === 0) return;
    for (const key of Object.keys(this.config.weights)) {
      this.config.weights[key] /= total;
    }
  }

  private loadWeights(): WeightConfig {
    if (existsSync(this.weightsFile)) {
      try {
        return JSON.parse(readFileSync(this.weightsFile, 'utf-8'));
      } catch { /* fall through */ }
    }
    return {
      weights: { ...DEFAULT_WEIGHTS },
      learningRate: 0.05,
      minWeight: 0.05,
      maxWeight: 0.40,
      version: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private loadStore(): FeedbackStore {
    if (existsSync(this.storeFile)) {
      try {
        return JSON.parse(readFileSync(this.storeFile, 'utf-8'));
      } catch { /* fall through */ }
    }
    return { records: [], weightHistory: [] };
  }

  private save(): void {
    writeFileSync(this.weightsFile, JSON.stringify(this.config, null, 2));
    writeFileSync(this.storeFile, JSON.stringify(this.store, null, 2));
  }
}

export function createFeedbackTuner(dataDir: string): FeedbackTuner {
  return new FeedbackTuner(dataDir);
}
