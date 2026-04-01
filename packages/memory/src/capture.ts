/**
 * Auto-capture integration
 *
 * Extracts facts, episodes, and decisions from conversation text
 * and stores them in memory automatically.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from './database.js';
import { storeFact } from './facts.js';
import { createEpisode } from './episodes.js';
import type { MemoryConfig, MemoryEntry, EpisodicMemory } from 'zouroboros-core';

export interface CaptureResult {
  facts: MemoryEntry[];
  episodes: EpisodicMemory[];
  totalExtracted: number;
  durationMs: number;
}

export interface CaptureOptions {
  source?: string;
  entity?: string;
  conversationId?: string;
  dryRun?: boolean;
}

/**
 * Pattern matchers for extracting structured information from text.
 */
const FACT_PATTERNS = [
  // "X is Y" / "X are Y"
  /(?:^|\.\s+)([A-Z][a-zA-Z0-9_ -]+)\s+(?:is|are)\s+(.+?)(?:\.|$)/gm,
  // "X uses Y" / "X requires Y"
  /(?:^|\.\s+)([A-Z][a-zA-Z0-9_ -]+)\s+(?:uses?|requires?|depends?\s+on|runs?\s+on)\s+(.+?)(?:\.|$)/gm,
  // Key-value from "set X to Y" / "changed X to Y"
  /(?:set|changed?|updated?|configured?)\s+([a-zA-Z_][a-zA-Z0-9_.]+)\s+(?:to|=)\s+(.+?)(?:\.|,|$)/gim,
];

const DECISION_PATTERNS = [
  // "decided to X" / "chose to X" / "will X"
  /(?:decided?|chose|choosing|will|going)\s+to\s+(.+?)(?:\.|$)/gim,
  // "instead of X, Y"
  /instead\s+of\s+(.+?),\s*(.+?)(?:\.|$)/gim,
];

const EPISODE_PATTERNS = [
  // "completed X" / "finished X" / "fixed X"
  /(?:completed?|finished|fixed|resolved|deployed|implemented|shipped)\s+(.+?)(?:\.|$)/gim,
  // "failed to X" / "error in X"
  /(?:failed?\s+to|error\s+in|broke|crashed|bug\s+in)\s+(.+?)(?:\.|$)/gim,
];

/**
 * Extract facts, decisions, and episodes from conversation text.
 */
export function extractFromText(text: string): {
  facts: { entity: string; key: string | undefined; value: string; category: string }[];
  episodes: { summary: string; outcome: 'success' | 'failure' | 'ongoing'; entities: string[] }[];
} {
  const facts: { entity: string; key: string | undefined; value: string; category: string }[] = [];
  const episodes: { summary: string; outcome: 'success' | 'failure' | 'ongoing'; entities: string[] }[] = [];
  const seen = new Set<string>();

  // Extract facts
  for (const pattern of FACT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const entity = match[1].trim();
      const value = match[2].trim();
      const key = entity + ':' + value;
      if (!seen.has(key) && entity.length > 1 && value.length > 1) {
        seen.add(key);
        facts.push({ entity, key: undefined, value, category: 'fact' });
      }
    }
  }

  // Extract decisions
  for (const pattern of DECISION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1].trim();
      if (value.length > 5 && !seen.has('decision:' + value)) {
        seen.add('decision:' + value);
        facts.push({
          entity: 'system',
          key: 'decision',
          value,
          category: 'decision',
        });
      }
    }
  }

  // Extract episodes
  for (const pattern of EPISODE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const summary = match[0].trim();
      const isFailure = /fail|error|broke|crash|bug/i.test(summary);
      if (summary.length > 5 && !seen.has('ep:' + summary)) {
        seen.add('ep:' + summary);
        // Extract capitalized words as entities
        const entities = Array.from(
          new Set(
            summary.match(/[A-Z][a-zA-Z0-9_-]+/g)?.filter(w => w.length > 2) ?? ['system']
          )
        );
        episodes.push({
          summary,
          outcome: isFailure ? 'failure' : 'success',
          entities: entities.length > 0 ? entities : ['system'],
        });
      }
    }
  }

  return { facts, episodes };
}

/**
 * Auto-capture: extract and store facts/episodes from conversation text.
 */
export async function autoCapture(
  text: string,
  config: MemoryConfig,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const start = performance.now();
  const { source = 'auto-capture', entity: defaultEntity, dryRun = false } = options;

  const extracted = extractFromText(text);
  const result: CaptureResult = {
    facts: [],
    episodes: [],
    totalExtracted: extracted.facts.length + extracted.episodes.length,
    durationMs: 0,
  };

  if (dryRun) {
    result.durationMs = performance.now() - start;
    return result;
  }

  // Store facts
  for (const fact of extracted.facts) {
    const stored = await storeFact({
      entity: defaultEntity ?? fact.entity,
      key: fact.key,
      value: fact.value,
      category: fact.category as any,
      source,
      decay: 'medium',
      importance: fact.category === 'decision' ? 1.5 : 1.0,
    }, config);
    result.facts.push(stored);
  }

  // Store episodes
  for (const ep of extracted.episodes) {
    const stored = createEpisode({
      summary: ep.summary,
      outcome: ep.outcome,
      entities: ep.entities,
      metadata: options.conversationId ? { conversationId: options.conversationId } : undefined,
    });
    result.episodes.push(stored);
  }

  result.durationMs = performance.now() - start;
  return result;
}

/**
 * Capture state for interval-based auto-capture.
 */
let captureTimer: ReturnType<typeof setInterval> | null = null;
let captureBuffer: string[] = [];

/**
 * Add text to the capture buffer.
 * Text is accumulated and periodically flushed.
 */
export function bufferForCapture(text: string): void {
  captureBuffer.push(text);
}

/**
 * Start interval-based auto-capture.
 * Flushes the capture buffer at the configured interval.
 */
export function startAutoCapture(
  config: MemoryConfig,
  options: CaptureOptions = {}
): void {
  if (captureTimer) return;

  const intervalMs = (config.captureIntervalMinutes ?? 30) * 60 * 1000;

  captureTimer = setInterval(async () => {
    if (captureBuffer.length === 0) return;

    const text = captureBuffer.join('\n\n');
    captureBuffer = [];

    await autoCapture(text, config, options);
  }, intervalMs);
}

/**
 * Stop interval-based auto-capture and flush remaining buffer.
 */
export async function stopAutoCapture(
  config: MemoryConfig,
  options: CaptureOptions = {}
): Promise<CaptureResult | null> {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }

  if (captureBuffer.length === 0) return null;

  const text = captureBuffer.join('\n\n');
  captureBuffer = [];
  return autoCapture(text, config, options);
}

/**
 * Get the current capture buffer size (for diagnostics).
 */
export function getCaptureBufferSize(): number {
  return captureBuffer.length;
}
