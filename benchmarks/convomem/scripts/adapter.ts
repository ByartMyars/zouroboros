#!/usr/bin/env bun
/**
 * ConvoMem Benchmark Adapter for Zouroboros Memory System
 *
 * Evaluates Salesforce ConvoMem: 75K QA pairs across 6 categories × 15 context sizes.
 * Uses turn-level chunking, FTS-primary hybrid search, and direct memory API.
 *
 * Usage:
 *   bun scripts/adapter.ts --dataset ../data/core_benchmark --output ../results/
 *   bun scripts/adapter.ts --dataset ../data/core_benchmark --output ../results/ --limit 5 --context-sizes 5,20
 *   bun scripts/adapter.ts --dataset ../data/core_benchmark --output ../results/ --no-vector --categories user_evidence
 */

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve, basename } from 'path';
import { tmpdir } from 'os';

import { initDatabase, closeDatabase, getDatabase, runMigrations } from '../../../packages/memory/src/database.js';
import { storeFact, searchFacts, searchFactsHybrid } from '../../../packages/memory/src/facts.js';
import type { MemoryConfig, MemorySearchResult } from 'zouroboros-core';

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.ZO_EMBEDDING_MODEL ?? 'nomic-embed-text';
const GEN_MODEL = process.env.ZO_ANSWER_MODEL ?? 'qwen2.5:7b';

const ALL_CATEGORIES = [
  'user_evidence',
  'assistant_facts_evidence',
  'changing_evidence',
  'abstention_evidence',
  'preference_evidence',
  'implicit_connection_evidence',
];

const DEFAULT_CONTEXT_SIZES = [5, 20, 50, 100];

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvidenceItem {
  question: string;
  answer: string;
  message_evidences: Array<{ speaker: string; text: string }>;
  conversations: Array<{ messages: Array<{ speaker: string; text: string }>; id?: string }>;
  category?: string;
}

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
    decayConfig: { permanent: 0, long: 365, medium: 90, short: 30 },
  };
}

async function ollamaGenerate(prompt: string): Promise<string> {
  const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GEN_MODEL, prompt, stream: false, options: { temperature: 0.1, num_predict: 128 } }),
  });
  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
  const data = (await resp.json()) as { response: string };
  return data.response.trim();
}

async function gpt4Judge(question: string, groundTruth: string, hypothesis: string, category: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'no_key';

  let criteria: string;
  if (category === 'abstention_evidence') {
    criteria = 'The system should NOT know this. "I don\'t know" or similar → CORRECT. Specific answer → INCORRECT.';
  } else if (category === 'preference_evidence' || category === 'implicit_connection_evidence') {
    criteria = 'Evaluate semantic equivalence. Exact wording not required.';
  } else {
    criteria = 'Is the answer factually correct based on ground truth? Key information must be present.';
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `Category: ${category}\nQuestion: ${question}\nGround Truth: ${groundTruth}\nSystem Answer: ${hypothesis}\n\n${criteria}\n\nRespond: CORRECT or INCORRECT` }],
      temperature: 0,
      max_tokens: 10,
    }),
  });
  if (!resp.ok) return 'judge_error';
  const data = (await resp.json()) as any;
  const label = data.choices?.[0]?.message?.content?.trim()?.toUpperCase();
  return label === 'CORRECT' ? 'correct' : label === 'INCORRECT' ? 'incorrect' : 'unknown';
}

// ─── Data Loading ─────────────────────────────────────────────────────

function loadEvidenceItems(dataDir: string, category: string): EvidenceItem[] {
  const catDir = join(dataDir, 'evidence_questions', category);
  if (!existsSync(catDir)) return [];

  const items: EvidenceItem[] = [];
  const subDirs = readdirSync(catDir).filter((d) => {
    try { return statSync(join(catDir, d)).isDirectory(); } catch { return false; }
  }).sort();

  for (const sub of subDirs) {
    const subPath = join(catDir, sub);
    const files = readdirSync(subPath).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(subPath, file), 'utf-8'));
        const evidenceItems: EvidenceItem[] = data.evidence_items ?? (Array.isArray(data) ? data : [data]);
        for (const item of evidenceItems) {
          if (item.question && item.answer && item.conversations?.length > 0) {
            items.push(item);
          }
        }
      } catch (e) {
        console.log(`  [WARN] Failed to parse ${join(subPath, file)}: ${e}`);
      }
    }
  }

  console.log(`  [load] ${category}: ${subDirs.length} subdirs, ${items.length} valid items`);
  return items;
}

function loadFillerConversations(dataDir: string, count: number): Array<{ messages: Array<{ speaker: string; text: string }> }> {
  const fillerDir = join(dataDir, 'filler_conversations');
  if (!existsSync(fillerDir)) return [];

  const conversations: Array<{ messages: Array<{ speaker: string; text: string }> }> = [];
  const files = readdirSync(fillerDir).filter((f) => f.endsWith('.json')).sort();

  for (const file of files) {
    if (conversations.length >= count) break;
    try {
      const data = JSON.parse(readFileSync(join(fillerDir, file), 'utf-8'));
      const items: EvidenceItem[] = data.evidence_items ?? (Array.isArray(data) ? data : [data]);
      for (const item of items) {
        if (conversations.length >= count) break;
        if (item.conversations) {
          for (const conv of item.conversations) {
            if (conversations.length >= count) break;
            if (conv.messages?.length > 0) conversations.push(conv);
          }
        }
      }
    } catch {}
  }

  return conversations.slice(0, count);
}

function simpleMatch(truth: string, hypothesis: string, category: string): boolean {
  if (!truth || !hypothesis) return false;
  if (category === 'abstention_evidence') {
    return /don't (know|have)|no information|not sure|cannot recall|i'm not aware/i.test(hypothesis);
  }
  const t = truth.toLowerCase().trim();
  const h = hypothesis.toLowerCase().trim();
  if (h.includes(t) || t.includes(h)) return true;
  const tWords = t.split(/\s+/).filter((w) => w.length > 2);
  if (tWords.length === 0) return false;
  let overlap = 0;
  for (const w of tWords) if (h.includes(w)) overlap++;
  return overlap / tWords.length >= 0.5;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      dataset: { type: 'string', short: 'd' },
      output: { type: 'string', short: 'o', default: '../results' },
      'context-sizes': { type: 'string', default: DEFAULT_CONTEXT_SIZES.join(',') },
      categories: { type: 'string', default: ALL_CATEGORIES.join(',') },
      limit: { type: 'string', default: '50' },
      judge: { type: 'boolean', default: false },
      'no-vector': { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || !values.dataset) {
    console.log(`
ConvoMem Benchmark Adapter for Zouroboros Memory System

Usage:
  bun scripts/adapter.ts --dataset <dir> [options]

Options:
  -d, --dataset <dir>          Path to core_benchmark directory (required)
  -o, --output <dir>           Output directory (default: ../results)
  --context-sizes <csv>        Context sizes to test (default: 5,20,50,100)
  --categories <csv>           Categories to test (default: all 6)
  --limit <n>                  Max samples per cell (default: 50)
  --judge                      Use GPT-4o judge (requires OPENAI_API_KEY)
  --no-vector                  FTS-only mode (fast testing)
  -v, --verbose                Verbose logging
`);
    process.exit(0);
  }

  const dataDir = resolve(values.dataset!);
  const outputDir = resolve(values.output!);
  const contextSizes = values['context-sizes']!.split(',').map(Number);
  const categories = values.categories!.split(',');
  const maxSamples = parseInt(values.limit!) || 50;
  const useJudge = values.judge!;
  const vectorEnabled = !values['no-vector'];
  const verbose = values.verbose!;

  mkdirSync(outputDir, { recursive: true });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ConvoMem Benchmark — Zouroboros Memory System');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Dataset:    ${dataDir}`);
  console.log(`  Sizes:      ${contextSizes.join(', ')}`);
  console.log(`  Categories: ${categories.join(', ')}`);
  console.log(`  Samples:    ${maxSamples} per cell`);
  console.log(`  Vector:     ${vectorEnabled ? 'enabled' : 'disabled (FTS-only)'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const allResults: Array<{
    category: string;
    context_size: number;
    question: string;
    ground_truth: string;
    hypothesis: string;
    retrieval_ms: number;
    answer_ms: number;
    correct: boolean;
    judge_label?: string;
  }> = [];

  for (const contextSize of contextSizes) {
    for (const category of categories) {
      console.log(`\n=== ${category} @ context_size=${contextSize} ===`);

      let items = loadEvidenceItems(dataDir, category);
      if (items.length === 0) {
        console.log('  -> No items found, skipping');
        continue;
      }
      items = items.slice(0, maxSamples);

      // Create isolated DB for this cell
      const dbPath = `/tmp/zo-convomem-${category}-${contextSize}-${Date.now()}.db`;
      const config = createMemoryConfig(dbPath, vectorEnabled);
      initDatabase(config);
      runMigrations(config);

      // Ingest evidence conversations (turn-level chunking)
      let factCount = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        for (let c = 0; c < item.conversations.length; c++) {
          const msgs = item.conversations[c].messages;
          for (let t = 0; t < msgs.length; t++) {
            if (msgs[t].speaker !== 'User') continue;
            let parts = [`[User]: ${msgs[t].text}`];
            if (t + 1 < msgs.length && msgs[t + 1].speaker !== 'User') {
              parts.push(`[${msgs[t + 1].speaker}]: ${msgs[t + 1].text}`);
            }
            const value = parts.join('\n');
            if (value.length < 30) continue;

            try {
              await storeFact({
                entity: `conv.evidence-${i}-${c}`,
                key: `turn-${t}`,
                value,
                category: 'fact',
                decay: 'permanent',
                source: 'evidence',
                confidence: 1.0,
                importance: 0.8,
              }, config);
              factCount++;
            } catch (err) {
              if (verbose) console.error(`  [WARN] Store failed: ${err}`);
            }
          }
        }
      }

      // Pad with fillers
      const evidenceConvCount = items.reduce((sum, item) => sum + item.conversations.length, 0);
      const fillersNeeded = Math.max(0, contextSize - evidenceConvCount);
      if (fillersNeeded > 0) {
        const fillers = loadFillerConversations(dataDir, fillersNeeded);
        for (let f = 0; f < fillers.length; f++) {
          const msgs = fillers[f].messages;
          for (let t = 0; t < msgs.length; t++) {
            if (msgs[t].speaker !== 'User') continue;
            let parts = [`[User]: ${msgs[t].text}`];
            if (t + 1 < msgs.length && msgs[t + 1].speaker !== 'User') {
              parts.push(`[${msgs[t + 1].speaker}]: ${msgs[t + 1].text}`);
            }
            const value = parts.join('\n');
            if (value.length < 30) continue;

            try {
              await storeFact({
                entity: `conv.filler-${f}`,
                key: `turn-${t}`,
                value,
                category: 'fact',
                decay: 'permanent',
                source: 'filler',
                confidence: 1.0,
                importance: 0.5,
              }, config);
              factCount++;
            } catch {}
          }
        }
      }

      console.log(`  [ingest] ${factCount} facts stored`);

      // Query each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        process.stdout.write(`\r  [query] ${i + 1}/${items.length}`);

        const t0 = performance.now();
        let results: MemorySearchResult[];
        try {
          if (vectorEnabled) {
            results = await searchFactsHybrid(item.question, config, { limit: 5, vectorWeight: 0.3 });
          } else {
            const fts = searchFacts(item.question, { limit: 5 });
            results = fts.map(e => ({ entry: e, score: 1.0, matchType: 'keyword' as const }));
          }
        } catch {
          results = [];
        }
        const retrievalMs = performance.now() - t0;

        const t1 = performance.now();
        let hypothesis = '';
        try {
          const ctxStr = results.map(r => r.entry.value).join('\n---\n').slice(0, 4000);
          const prompt = category === 'abstention_evidence'
            ? `Based on the following conversation memories, answer the question.\nIf the information is NOT present, say "I don't have that information."\n\nContext:\n${ctxStr}\n\nQuestion: ${item.question}\n\nAnswer:`
            : `Given these conversation memories, answer the question with ONLY the specific fact requested.\n\nContext:\n${ctxStr}\n\nQuestion: ${item.question}\n\nAnswer:`;
          hypothesis = await ollamaGenerate(prompt);
        } catch {
          hypothesis = 'Error generating answer';
        }
        const answerMs = performance.now() - t1;

        let correct = false;
        let judgeLabel: string | undefined;
        if (useJudge) {
          judgeLabel = await gpt4Judge(item.question, item.answer, hypothesis, category);
          correct = judgeLabel === 'correct';
        } else {
          correct = simpleMatch(item.answer, hypothesis, category);
        }

        allResults.push({
          category,
          context_size: contextSize,
          question: item.question,
          ground_truth: item.answer,
          hypothesis,
          retrieval_ms: Math.round(retrievalMs),
          answer_ms: Math.round(answerMs),
          correct,
          judge_label: judgeLabel,
        });
      }
      console.log('');

      closeDatabase();
      try { rmSync(dbPath); } catch {}
    }
  }

  // Aggregate
  const matrix: Record<string, Record<number, { correct: number; total: number }>> = {};
  for (const r of allResults) {
    if (!matrix[r.category]) matrix[r.category] = {};
    if (!matrix[r.category][r.context_size]) matrix[r.category][r.context_size] = { correct: 0, total: 0 };
    matrix[r.category][r.context_size].total++;
    if (r.correct) matrix[r.category][r.context_size].correct++;
  }

  const scoreSummary: Record<string, Record<number, number>> = {};
  for (const [cat, sizes] of Object.entries(matrix)) {
    scoreSummary[cat] = {};
    for (const [size, counts] of Object.entries(sizes)) {
      scoreSummary[cat][Number(size)] = Math.round((counts.correct / counts.total) * 10000) / 100;
    }
  }

  const totalCorrect = allResults.filter((r) => r.correct).length;
  const overallAccuracy = allResults.length > 0 ? Math.round((totalCorrect / allResults.length) * 10000) / 100 : 0;

  const runResult = {
    benchmark: 'ConvoMem',
    timestamp: new Date().toISOString(),
    dataset: basename(dataDir),
    total_questions: allResults.length,
    scores: { overall_accuracy: overallAccuracy, accuracy_matrix: scoreSummary },
    latency: {
      avg_retrieval_ms: Math.round(allResults.reduce((a, r) => a + r.retrieval_ms, 0) / (allResults.length || 1)),
      avg_answer_ms: Math.round(allResults.reduce((a, r) => a + r.answer_ms, 0) / (allResults.length || 1)),
    },
    questions: allResults,
  };

  const outFile = join(outputDir, `convomem-${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(runResult, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  CONVOMEM BENCHMARK COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total questions: ${allResults.length}`);
  console.log(`  Overall accuracy: ${overallAccuracy}%`);
  for (const [cat, sizes] of Object.entries(scoreSummary)) {
    const vals = Object.entries(sizes).map(([s, a]) => `${s}=${a}%`).join(', ');
    console.log(`  ${cat}: ${vals}`);
  }
  console.log(`  Results: ${outFile}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('[convomem] Fatal:', e);
  process.exit(1);
});
