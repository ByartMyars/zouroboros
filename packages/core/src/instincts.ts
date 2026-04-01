/**
 * ECC-004: Instincts — Pattern Auto-Extraction
 *
 * Automatic extraction of behavioral patterns from sessions.
 * Detects recurring patterns, scores confidence, and extracts
 * hot-loadable instinct files for future sessions.
 * Persists to disk (JSON file) matching selfheal persistence pattern.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { HookSystem, LifecycleEvent } from './hooks.js';

export interface Instinct {
  id: string;
  name: string;
  description: string;
  confidence: number; // 0-1
  pattern: PatternSpec;
  trigger: TriggerSpec;
  resolution: string;
  evidenceCount: number;
  lastSeen: string;
  createdAt: string;
  status: InstinctStatus;
  tags: string[];
}

export type InstinctStatus = 'candidate' | 'active' | 'suspended' | 'retired';

export interface PatternSpec {
  type: 'error_repeat' | 'tool_sequence' | 'context_drift' | 'custom';
  signature: string;
  frequency: number; // times observed
  windowSize: number; // observations window
}

export interface TriggerSpec {
  event: LifecycleEvent | '*';
  condition: string;
  cooldownMs: number;
}

export interface PatternEvidence {
  timestamp: string;
  sessionId?: string;
  context: string;
  matchStrength: number; // 0-1 (negative values indicate rejected matches)
}

export interface InstinctMatch {
  instinct: Instinct;
  confidence: number;
  evidence: PatternEvidence[];
}

export interface ExtractionResult {
  patternsDetected: number;
  instinctsCreated: number;
  instinctsUpdated: number;
  details: Array<{ id: string; action: 'created' | 'updated' | 'skipped'; reason?: string }>;
}

interface InstinctStore {
  version: string;
  instincts: Instinct[];
  evidence: Record<string, PatternEvidence[]>;
}

const CONFIDENCE_THRESHOLD = 0.6;
const MIN_EVIDENCE_FOR_ACTIVE = 3;

export class InstinctEngine {
  private instincts: Map<string, Instinct> = new Map();
  private evidence: Map<string, PatternEvidence[]> = new Map();
  private lastFired: Map<string, number> = new Map();
  private dataFile: string | null = null;
  private hooks: HookSystem | null = null;
  private pendingObservations: Array<{ context: string; outcome: string; timestamp: string; sessionId?: string }> = [];

  constructor(dataDir?: string) {
    if (dataDir) {
      mkdirSync(dataDir, { recursive: true });
      this.dataFile = join(dataDir, 'instincts.json');
      this.load();
    }
  }

  wireHooks(hooks: HookSystem): void {
    this.hooks = hooks;

    // Auto-extract from task failures
    hooks.on('task.fail', (payload) => {
      const context = String(payload.data.error || payload.data.detail || '');
      if (context.length > 0) {
        this.recordObservation({
          context,
          outcome: String(payload.data.resolution || 'task failed'),
          timestamp: payload.timestamp,
          sessionId: String(payload.data.sessionId || ''),
        });
      }
    }, { priority: 50, description: 'Instinct auto-extraction from task failures' });

    // Auto-extract from error recovery
    hooks.on('error.recovery', (payload) => {
      const context = String(payload.data.error || '');
      const outcome = String(payload.data.recovery || 'recovered');
      if (context.length > 0) {
        this.recordObservation({ context, outcome, timestamp: payload.timestamp });
      }
    }, { priority: 50, description: 'Instinct auto-extraction from error recovery' });
  }

  /** Record a single observation for later batch extraction */
  recordObservation(obs: { context: string; outcome: string; timestamp: string; sessionId?: string }): void {
    this.pendingObservations.push(obs);
    // Auto-extract when enough observations accumulate
    if (this.pendingObservations.length >= 5) {
      this.extract(this.pendingObservations.splice(0));
    }
  }

  register(instinct: Instinct): void {
    this.instincts.set(instinct.id, instinct);
    if (!this.evidence.has(instinct.id)) {
      this.evidence.set(instinct.id, []);
    }
    this.save();
  }

  get(id: string): Instinct | null {
    return this.instincts.get(id) || null;
  }

  list(filter?: { status?: InstinctStatus; minConfidence?: number; tag?: string }): Instinct[] {
    let results = [...this.instincts.values()];

    if (filter?.status) {
      results = results.filter(i => i.status === filter.status);
    }
    if (filter?.minConfidence !== undefined) {
      results = results.filter(i => i.confidence >= filter.minConfidence!);
    }
    if (filter?.tag) {
      results = results.filter(i => i.tags.includes(filter.tag!));
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  addEvidence(instinctId: string, ev: PatternEvidence): boolean {
    const instinct = this.instincts.get(instinctId);
    if (!instinct) return false;

    const evidenceList = this.evidence.get(instinctId) || [];
    evidenceList.push(ev);

    // Keep last 100 evidence items
    if (evidenceList.length > 100) {
      evidenceList.splice(0, evidenceList.length - 100);
    }
    this.evidence.set(instinctId, evidenceList);

    // Update instinct
    instinct.evidenceCount = evidenceList.length;
    instinct.lastSeen = ev.timestamp;
    instinct.pattern.frequency = evidenceList.length;

    // Recalculate confidence
    instinct.confidence = this.calculateConfidence(evidenceList);

    // Auto-promote to active if enough evidence
    if (instinct.status === 'candidate' &&
        instinct.confidence >= CONFIDENCE_THRESHOLD &&
        instinct.evidenceCount >= MIN_EVIDENCE_FOR_ACTIVE) {
      instinct.status = 'active';
    }

    this.save();
    return true;
  }

  /** Record a negative match — the instinct fired but was wrong */
  rejectMatch(instinctId: string): boolean {
    const instinct = this.instincts.get(instinctId);
    if (!instinct) return false;

    this.addEvidence(instinctId, {
      timestamp: new Date().toISOString(),
      context: 'rejected by user',
      matchStrength: -0.5,
    });

    // Auto-suspend if confidence drops too low
    if (instinct.confidence < 0.3 && instinct.status === 'active') {
      instinct.status = 'suspended';
    }

    this.save();
    return true;
  }

  match(context: string, event?: string): InstinctMatch[] {
    const matches: InstinctMatch[] = [];

    for (const instinct of this.instincts.values()) {
      if (instinct.status !== 'active') continue;

      // Check cooldown
      const lastFired = this.lastFired.get(instinct.id) || 0;
      if (Date.now() - lastFired < instinct.trigger.cooldownMs) continue;

      // Check event match
      if (event && instinct.trigger.event !== '*' && instinct.trigger.event !== event) continue;

      // Check pattern signature match
      const matchStrength = this.computeMatch(instinct, context);
      if (matchStrength > 0.3) {
        const evidence = this.evidence.get(instinct.id) || [];
        matches.push({
          instinct,
          confidence: matchStrength * instinct.confidence,
          evidence: evidence.slice(-3),
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  fire(instinctId: string): boolean {
    const instinct = this.instincts.get(instinctId);
    if (!instinct || instinct.status !== 'active') return false;

    this.lastFired.set(instinctId, Date.now());

    // Emit hook event
    if (this.hooks) {
      this.hooks.emit('instinct.fired', {
        instinctId,
        name: instinct.name,
        confidence: instinct.confidence,
        resolution: instinct.resolution,
      }, 'instinct-engine').catch(() => {});
    }

    return true;
  }

  extract(observations: Array<{ context: string; outcome: string; timestamp: string; sessionId?: string }>): ExtractionResult {
    const result: ExtractionResult = {
      patternsDetected: 0,
      instinctsCreated: 0,
      instinctsUpdated: 0,
      details: [],
    };

    // Group by context similarity using Jaccard index
    const groups = this.groupByContextSimilarity(observations);
    result.patternsDetected = groups.length;

    for (const group of groups) {
      if (group.items.length < 2) {
        result.details.push({ id: '', action: 'skipped', reason: 'insufficient observations' });
        continue;
      }

      const signature = this.generateSignature(group.items);
      const existingId = this.findBySignature(signature);

      if (existingId) {
        for (const item of group.items) {
          this.addEvidence(existingId, {
            timestamp: item.timestamp,
            sessionId: item.sessionId,
            context: item.context.slice(0, 200),
            matchStrength: 0.8,
          });
        }
        result.instinctsUpdated++;
        result.details.push({ id: existingId, action: 'updated' });
      } else {
        const id = `instinct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const instinct: Instinct = {
          id,
          name: `Auto: ${signature.slice(0, 40)}`,
          description: `Pattern detected from ${group.items.length} observations`,
          confidence: group.items.length >= MIN_EVIDENCE_FOR_ACTIVE ? 0.7 : 0.4,
          pattern: {
            type: 'custom',
            signature,
            frequency: group.items.length,
            windowSize: group.items.length,
          },
          trigger: {
            event: '*',
            condition: signature,
            cooldownMs: 60000,
          },
          resolution: group.items[0].outcome,
          evidenceCount: group.items.length,
          lastSeen: group.items[group.items.length - 1].timestamp,
          createdAt: new Date().toISOString(),
          status: group.items.length >= MIN_EVIDENCE_FOR_ACTIVE ? 'active' : 'candidate',
          tags: ['auto-extracted'],
        };

        this.instincts.set(id, instinct);
        this.evidence.set(id, []);
        for (const item of group.items) {
          this.addEvidence(id, {
            timestamp: item.timestamp,
            sessionId: item.sessionId,
            context: item.context.slice(0, 200),
            matchStrength: 0.8,
          });
        }

        result.instinctsCreated++;
        result.details.push({ id, action: 'created' });
      }
    }

    this.save();
    return result;
  }

  suspend(id: string): boolean {
    const instinct = this.instincts.get(id);
    if (!instinct) return false;
    instinct.status = 'suspended';
    this.save();
    return true;
  }

  activate(id: string): boolean {
    const instinct = this.instincts.get(id);
    if (!instinct) return false;
    instinct.status = 'active';
    this.save();
    return true;
  }

  retire(id: string): boolean {
    const instinct = this.instincts.get(id);
    if (!instinct) return false;
    instinct.status = 'retired';
    this.save();
    return true;
  }

  remove(id: string): boolean {
    this.evidence.delete(id);
    this.lastFired.delete(id);
    const deleted = this.instincts.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  getStats(): {
    total: number;
    byStatus: Record<InstinctStatus, number>;
    avgConfidence: number;
    totalEvidence: number;
  } {
    const all = [...this.instincts.values()];
    const byStatus: Record<string, number> = { candidate: 0, active: 0, suspended: 0, retired: 0 };
    let totalConfidence = 0;
    let totalEvidence = 0;

    for (const inst of all) {
      byStatus[inst.status] = (byStatus[inst.status] || 0) + 1;
      totalConfidence += inst.confidence;
      totalEvidence += inst.evidenceCount;
    }

    return {
      total: all.length,
      byStatus: byStatus as Record<InstinctStatus, number>,
      avgConfidence: all.length > 0 ? totalConfidence / all.length : 0,
      totalEvidence,
    };
  }

  exportInstinct(id: string): object | null {
    const instinct = this.instincts.get(id);
    if (!instinct) return null;

    return {
      ...instinct,
      evidence: this.evidence.get(id) || [],
    };
  }

  importInstinct(data: Instinct & { evidence?: PatternEvidence[] }): void {
    const { evidence: evidenceData, ...instinct } = data;
    this.instincts.set(instinct.id, instinct);
    if (evidenceData) {
      this.evidence.set(instinct.id, evidenceData);
    }
    if (!this.evidence.has(instinct.id)) {
      this.evidence.set(instinct.id, []);
    }
    this.save();
  }

  private calculateConfidence(evidenceList: PatternEvidence[]): number {
    if (evidenceList.length === 0) return 0;

    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const ev of evidenceList) {
      const age = now - new Date(ev.timestamp).getTime();
      const recencyWeight = Math.exp(-age / (7 * 24 * 3600 * 1000)); // 7-day half-life
      const weight = recencyWeight + 0.1;
      weightedSum += ev.matchStrength * weight;
      totalWeight += weight;
    }

    const avgStrength = weightedSum / totalWeight;
    const countFactor = Math.min(evidenceList.length / 10, 1);

    return Math.max(Math.min(avgStrength * (0.5 + 0.5 * countFactor), 1.0), 0);
  }

  private computeMatch(instinct: Instinct, context: string): number {
    const sigWords = instinct.pattern.signature.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const contextLower = context.toLowerCase();

    if (sigWords.length === 0) return 0;

    // Use substring matching for better accuracy
    let matches = 0;
    for (const word of sigWords) {
      if (contextLower.includes(word)) matches++;
    }

    return matches / sigWords.length;
  }

  /**
   * Group observations by context similarity using Jaccard index on word sets.
   */
  private groupByContextSimilarity(observations: Array<{ context: string; outcome: string; timestamp: string; sessionId?: string }>): Array<{ items: typeof observations }> {
    if (observations.length === 0) return [];

    const wordSets = observations.map(obs =>
      new Set(obs.context.toLowerCase().split(/\s+/).filter(w => w.length >= 3))
    );

    const assigned = new Array(observations.length).fill(false);
    const groups: Array<{ items: typeof observations }> = [];

    for (let i = 0; i < observations.length; i++) {
      if (assigned[i]) continue;
      assigned[i] = true;

      const group = [observations[i]];

      for (let j = i + 1; j < observations.length; j++) {
        if (assigned[j]) continue;

        const jaccard = this.jaccardSimilarity(wordSets[i], wordSets[j]);
        if (jaccard >= 0.4) {
          group.push(observations[j]);
          assigned[j] = true;
        }
      }

      groups.push({ items: group });
    }

    return groups;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const word of a) {
      if (b.has(word)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private generateSignature(items: Array<{ context: string; outcome: string }>): string {
    const wordCounts = new Map<string, number>();
    for (const item of items) {
      const words = new Set(item.context.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    const threshold = Math.ceil(items.length * 0.5);
    const commonWords = [...wordCounts.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
      .sort(); // Sort alphabetically for stable signatures

    return commonWords.join(' ') || items[0].context.slice(0, 50);
  }

  private findBySignature(signature: string): string | null {
    const sigWords = new Set(signature.split(' '));
    for (const [id, instinct] of this.instincts) {
      const existingWords = new Set(instinct.pattern.signature.split(' '));
      const jaccard = this.jaccardSimilarity(sigWords, existingWords);
      if (jaccard >= 0.7) {
        return id;
      }
    }
    return null;
  }

  private load(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;
    try {
      const store: InstinctStore = JSON.parse(readFileSync(this.dataFile, 'utf-8'));
      for (const instinct of store.instincts) {
        this.instincts.set(instinct.id, instinct);
      }
      for (const [id, evidenceList] of Object.entries(store.evidence)) {
        this.evidence.set(id, evidenceList);
      }
    } catch { /* start fresh if corrupt */ }
  }

  private save(): void {
    if (!this.dataFile) return;
    const store: InstinctStore = {
      version: '1.0.0',
      instincts: [...this.instincts.values()],
      evidence: Object.fromEntries(this.evidence),
    };
    writeFileSync(this.dataFile, JSON.stringify(store, null, 2));
  }
}

export function createInstinctEngine(dataDir?: string): InstinctEngine {
  return new InstinctEngine(dataDir);
}
