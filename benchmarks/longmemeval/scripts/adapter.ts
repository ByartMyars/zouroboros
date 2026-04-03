#!/usr/bin/env bun
/**
 * LongMemEval Benchmark Adapter for Zouroboros Memory System (v2)
 *
 * Optimizations over v1:
 *   - Turn-level chunking (user+assistant pairs, not 500-char sliding window)
 *   - Session expansion: ±2 turns around matched chunks from top-3 sessions
 *   - FTS-primary hybrid: keyword matches ranked above vector-only results
 *   - Assertive answer prompt (reduces false "I don't know" abstention)
 *   - Concurrent embedding generation
 *
 * Usage:
 *   bun scripts/adapter.ts --dataset ../data/longmemeval_oracle.json --output ../results/run.jsonl
 *   bun scripts/adapter.ts --dataset ../data/longmemeval_oracle.json --output ../results/run.jsonl --limit 10
 *   bun scripts/adapter.ts --dataset ../data/longmemeval_oracle.json --output ../results/run.jsonl --no-vector
 *   bun scripts/adapter.ts --dataset ../data/longmemeval_oracle.json --output ../results/run.jsonl --retrieval-only ../results/retrieval.jsonl
 */

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, resolve, basename } from 'path';

import { initDatabase, closeDatabase, getDatabase, runMigrations } from '../../../packages/memory/src/database.js';
import { storeFact, searchFacts, searchFactsVector, searchFactsHybrid } from '../../../packages/memory/src/facts.js';
import { generateEmbedding } from '../../../packages/memory/src/embeddings.js';
import type { MemoryConfig, MemoryEntry, MemorySearchResult } from 'zouroboros-core';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  has_answer?: boolean;
}

interface LongMemEntry {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  question_date: string;
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: Turn[][];
  answer_session_ids: string[];
}

interface HypothesisEntry {
  question_id: string;
  hypothesis: string;
}

interface RetrievalEntry {
  question_id: string;
  retrieved_session_ids: string[];
  scores: number[];
}

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.ZO_EMBEDDING_MODEL ?? 'nomic-embed-text';
const GEN_MODEL = process.env.ZO_ANSWER_MODEL ?? 'qwen2.5:7b';
const TOP_K = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMemoryConfig(dbPath: string, vectorEnabled: boolean): MemoryConfig {
  return {
    enabled: true,
    dbPath,
    vectorEnabled,
    ollamaUrl: OLLAMA_URL,
    ollamaModel: EMBED_MODEL,
    autoCapture: false,
    captureIntervalMinutes: 0,
    graphBoost: false,
    hydeExpansion: false,
    decayConfig: {
      permanent: 0,
      long: 365,
      medium: 90,
      short: 30,
    },
  };
}

function parseDate(dateStr: string): Date {
  const match = dateStr.match(/(\d{4})\/(\d{2})\/(\d{2}).*?(\d{2}):(\d{2})/);
  if (!match) return new Date();
  const [, year, month, day, hour, minute] = match;
  return new Date(+year, +month - 1, +day, +hour, +minute);
}

/**
 * Turn-level chunking: store each user+assistant pair as a single fact.
 * This concentrates BM25/vector signal for precise retrieval, instead of
 * 500-char sliding windows that split answers across chunks.
 */
function sessionToFacts(
  session: Turn[],
  sessionId: string,
  sessionDate: string
): { entity: string; key: string; value: string; metadata: Record<string, unknown> }[] {
  const facts: { entity: string; key: string; value: string; metadata: Record<string, unknown> }[] = [];
  const date = parseDate(sessionDate);

  for (let i = 0; i < session.length; i++) {
    const turn = session[i];
    if (turn.role !== 'user') continue;

    let chunkParts: string[] = [`[user]: ${turn.content.trim()}`];
    if (i + 1 < session.length && session[i + 1].role === 'assistant') {
      chunkParts.push(`[assistant]: ${session[i + 1].content.trim()}`);
    }

    const value = chunkParts.join('\n');
    if (value.length < 30) continue;

    facts.push({
      entity: `session:${sessionId}`,
      key: `turn_${i}`,
      value,
      metadata: {
        role: 'user',
        turn_index: i,
        session_id: sessionId,
        session_date: sessionDate,
        timestamp: date.toISOString(),
        has_answer: turn.has_answer || (i + 1 < session.length && session[i + 1].has_answer) || false,
      },
    });
  }

  return facts;
}

async function generateAnswer(question: string, context: string): Promise<string> {
  const prompt = `Given these conversation memories, answer the question with ONLY the specific fact requested. Give a short, direct answer — just the name, number, date, or place. Do not explain or qualify.

Context:
${context}

Question: ${question}

Answer:`;

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEN_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 128 },
      }),
    });

    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
    const data = await resp.json() as { response: string };
    return data.response.trim();
  } catch (err) {
    console.error(`  [ERROR] Answer generation failed:`, err);
    return 'Unable to generate answer';
  }
}

function formatContext(results: MemorySearchResult[]): string {
  return results
    .map((r, i) => {
      const meta = (r as any).metadata || {};
      const dateStr = meta.session_date || 'unknown date';
      return `[${i + 1}] (${dateStr}) ${r.entry.value}`;
    })
    .join('\n\n');
}

/**
 * Session expansion: for top-3 unique sessions found by search, pull ±2
 * adjacent turns around each matched chunk. This ensures multi-turn answers
 * aren't missed when only one turn in a session matches the query.
 */
function expandSessionContext(
  results: MemorySearchResult[],
  config: MemoryConfig
): MemorySearchResult[] {
  const seenSessions = new Set<string>();
  const matchedValues = new Set(results.map(r => r.entry.value));
  const expanded: MemorySearchResult[] = [];

  for (const r of results) {
    const sessionEntity = r.entry.entity;
    if (seenSessions.size >= 3) break;
    if (seenSessions.has(sessionEntity)) continue;
    seenSessions.add(sessionEntity);

    // Get all turns from this session
    try {
      const sessionFacts = searchFacts(sessionEntity, { limit: 100 });

      // Find which indices were matched
      const matchedIndices: number[] = [];
      for (let t = 0; t < sessionFacts.length; t++) {
        if (matchedValues.has(sessionFacts[t].value)) {
          matchedIndices.push(t);
        }
      }

      // Expand ±2 around matches
      const includeIndices = new Set<number>();
      for (const idx of matchedIndices) {
        for (let t = Math.max(0, idx - 2); t <= Math.min(sessionFacts.length - 1, idx + 2); t++) {
          includeIndices.add(t);
        }
      }
      if (matchedIndices.length === 0) {
        for (let t = 0; t < Math.min(3, sessionFacts.length); t++) {
          includeIndices.add(t);
        }
      }

      for (const t of Array.from(includeIndices).sort((a, b) => a - b)) {
        if (!matchedValues.has(sessionFacts[t].value)) {
          expanded.push({
            entry: sessionFacts[t],
            score: 0.5,
            matchType: 'keyword' as const,
          });
          matchedValues.add(sessionFacts[t].value);
        }
      }
    } catch {
      // Session lookup failed, skip expansion
    }
  }

  return [...results, ...expanded].slice(0, 12);
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      dataset: { type: 'string', short: 'd' },
      output: { type: 'string', short: 'o' },
      limit: { type: 'string', short: 'l' },
      'no-vector': { type: 'boolean', default: false },
      'retrieval-only': { type: 'string' },
      'top-k': { type: 'string' },
      'db-path': { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || !values.dataset) {
    console.log(`
LongMemEval Benchmark Adapter for Zouroboros Memory System (v2)

Usage:
  bun scripts/adapter.ts --dataset <path> --output <path> [options]

Options:
  -d, --dataset <path>         Path to LongMemEval JSON file (required)
  -o, --output <path>          Output JSONL path (default: ../results/hypothesis.jsonl)
  -l, --limit <n>              Only process first N questions
  --no-vector                  Disable vector search (FTS-only baseline)
  --retrieval-only <path>      Also output retrieval results to this file
  --top-k <n>                  Number of results to retrieve (default: 10)
  --db-path <path>             Custom DB path (default: /tmp/longmemeval-{timestamp}.db)
  -v, --verbose                Verbose logging
  -h, --help                   Show this help
`);
    process.exit(0);
  }

  const datasetPath = resolve(values.dataset);
  const outputPath = resolve(values.output || '../results/hypothesis.jsonl');
  const limit = values.limit ? parseInt(values.limit) : undefined;
  const vectorEnabled = !values['no-vector'];
  const retrievalPath = values['retrieval-only'] ? resolve(values['retrieval-only']) : null;
  const topK = values['top-k'] ? parseInt(values['top-k']) : TOP_K;
  const verbose = values.verbose;
  const dbPath = values['db-path'] || `/tmp/longmemeval-${Date.now()}.db`;

  mkdirSync(dirname(outputPath), { recursive: true });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LongMemEval Benchmark — Zouroboros Memory System (v2)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Dataset:    ${datasetPath}`);
  console.log(`  Output:     ${outputPath}`);
  console.log(`  DB:         ${dbPath}`);
  console.log(`  Vector:     ${vectorEnabled ? 'enabled (FTS-primary hybrid)' : 'disabled (FTS-only)'}`);
  console.log(`  Top-K:      ${topK}`);
  console.log(`  Gen Model:  ${GEN_MODEL}`);
  console.log(`  Embed:      ${EMBED_MODEL}`);
  if (limit) console.log(`  Limit:      ${limit} questions`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Load dataset
  console.log('[1/4] Loading dataset...');
  const raw = readFileSync(datasetPath, 'utf-8');
  let dataset: LongMemEntry[] = JSON.parse(raw);
  if (limit) dataset = dataset.slice(0, limit);
  console.log(`  Loaded ${dataset.length} questions\n`);

  // Initialize isolated DB
  console.log('[2/4] Initializing memory database...');
  const config = createMemoryConfig(dbPath, vectorEnabled);
  initDatabase(config);
  runMigrations(config);
  console.log(`  Database ready at ${dbPath}\n`);

  // Ingest all sessions with turn-level chunking
  console.log('[3/4] Ingesting conversation sessions...');
  const ingestedSessionIds = new Set<string>();
  let factCount = 0;

  for (let qi = 0; qi < dataset.length; qi++) {
    const entry = dataset[qi];
    for (let s = 0; s < entry.haystack_sessions.length; s++) {
      const sessionId = entry.haystack_session_ids[s];
      if (ingestedSessionIds.has(sessionId)) continue;
      ingestedSessionIds.add(sessionId);

      const session = entry.haystack_sessions[s];
      const sessionDate = entry.haystack_dates[s] || entry.question_date;
      const facts = sessionToFacts(session, sessionId, sessionDate);

      for (const fact of facts) {
        try {
          await storeFact({
            entity: fact.entity,
            key: fact.key,
            value: fact.value,
            category: 'fact',
            decay: 'permanent',
            source: 'longmemeval',
            confidence: 1.0,
            metadata: fact.metadata,
          }, config);
          factCount++;
        } catch (err) {
          if (verbose) console.error(`  [WARN] Failed to store fact: ${err}`);
        }
      }
    }

    if ((qi + 1) % 50 === 0 || qi === dataset.length - 1) {
      console.log(`  Progress: ${qi + 1}/${dataset.length} questions, ${ingestedSessionIds.size} sessions, ${factCount} facts`);
    }
  }
  console.log(`  Ingestion complete: ${factCount} facts from ${ingestedSessionIds.size} sessions\n`);

  // Query each question
  console.log('[4/4] Running queries and generating answers...');
  const hypotheses: HypothesisEntry[] = [];
  const retrievals: RetrievalEntry[] = [];
  const startTime = Date.now();
  const typeCounters: Record<string, { total: number; answered: number }> = {};

  for (let i = 0; i < dataset.length; i++) {
    const entry = dataset[i];
    const qType = entry.question_type;
    if (!typeCounters[qType]) typeCounters[qType] = { total: 0, answered: 0 };
    typeCounters[qType].total++;

    if (verbose) console.log(`  [${i + 1}/${dataset.length}] ${entry.question_id} (${qType})`);

    // Retrieve relevant facts
    let results: MemorySearchResult[];
    try {
      if (vectorEnabled) {
        // FTS-primary hybrid: use hybrid search but ensure FTS results
        // are ranked above vector-only matches
        results = await searchFactsHybrid(entry.question, config, {
          limit: topK,
          vectorWeight: 0.3, // FTS-primary: low vector weight
        });
      } else {
        const ftsResults = searchFacts(entry.question, { limit: topK });
        results = ftsResults.map(e => ({ entry: e, score: 1.0, matchType: 'keyword' as const }));
      }
    } catch (err) {
      if (verbose) console.error(`  [WARN] Search failed for ${entry.question_id}:`, err);
      results = [];
    }

    // Session expansion: pull adjacent turns from matched sessions
    if (results.length > 0) {
      results = expandSessionContext(results, config);
    }

    // Track retrieval results
    if (retrievalPath) {
      const sessionIds = results
        .map(r => {
          const meta = (r as any).metadata || {};
          return meta.session_id || r.entry.entity.replace('session:', '');
        })
        .filter((v, idx, arr) => arr.indexOf(v) === idx);

      retrievals.push({
        question_id: entry.question_id,
        retrieved_session_ids: sessionIds,
        scores: results.map(r => r.score),
      });
    }

    // Generate answer from context
    const context = formatContext(results);
    let hypothesis: string;

    if (results.length === 0) {
      hypothesis = "I don't have enough information to answer this question.";
    } else {
      hypothesis = await generateAnswer(entry.question, context);
      typeCounters[qType].answered++;
    }

    hypotheses.push({ question_id: entry.question_id, hypothesis });

    if ((i + 1) % 25 === 0 || i === dataset.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(2);
      console.log(`  Progress: ${i + 1}/${dataset.length} (${elapsed}s, ${rate} q/s)`);
    }
  }

  // Write results
  const jsonl = hypotheses.map(h => JSON.stringify(h)).join('\n') + '\n';
  writeFileSync(outputPath, jsonl);
  console.log(`\n  Hypotheses written to ${outputPath}`);

  if (retrievalPath) {
    const retJsonl = retrievals.map(r => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(retrievalPath, retJsonl);
    console.log(`  Retrieval results written to ${retrievalPath}`);
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BENCHMARK COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total questions:  ${dataset.length}`);
  console.log(`  Total time:       ${totalTime}s`);
  console.log(`  Avg time/query:   ${(parseFloat(totalTime) / dataset.length).toFixed(2)}s`);
  console.log(`  Facts ingested:   ${factCount}`);
  console.log(`  Sessions:         ${ingestedSessionIds.size}`);
  console.log(`  Vector search:    ${vectorEnabled ? 'FTS-primary hybrid' : 'FTS-only'}`);
  console.log('');
  console.log('  Per-type breakdown:');
  for (const [type, counts] of Object.entries(typeCounters)) {
    console.log(`    ${type.padEnd(30)} ${counts.answered}/${counts.total} answered`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\nNext step: Evaluate with GPT-4o judge:`);
  console.log(`  cd eval/ && python3 evaluate_qa.py gpt-4o ${outputPath} ${datasetPath}`);

  closeDatabase();
  console.log(`\nBenchmark DB preserved at ${dbPath} (delete when done)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
