/**
 * Chain-of-Thought answering with multi-hop fallback.
 *
 * Takes retrieved memory chunks and uses CoT reasoning to extract
 * a precise answer. If the first pass can't answer, it refines the
 * query and does a second retrieval pass (multi-hop).
 */

import type { MemoryConfig, MemorySearchResult, CotAnswerResult } from 'zouroboros-core';
import { llmCall } from './llm.js';
import { searchFactsHybrid } from './facts.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_CHAR_LIMIT = 4000;

function buildContext(results: MemorySearchResult[], charLimit: number): string {
  const parts: string[] = [];
  let total = 0;
  for (const r of results) {
    const chunk = r.entry.value;
    if (total + chunk.length > charLimit) {
      const remaining = charLimit - total;
      if (remaining > 50) parts.push(chunk.slice(0, remaining));
      break;
    }
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join('\n---\n');
}

export async function answerWithCoT(
  question: string,
  results: MemorySearchResult[],
  config: MemoryConfig,
  options?: { contextCharLimit?: number },
): Promise<CotAnswerResult> {
  const model = config.cot?.model ?? DEFAULT_MODEL;
  const charLimit = options?.contextCharLimit ?? config.reranker?.contextCharLimit ?? DEFAULT_CHAR_LIMIT;
  const enableMultiHop = config.cot?.multiHopFallback !== false;

  const context = buildContext(results, charLimit);

  const cotPrompt = `You are a memory retrieval assistant. Given conversation memories, answer the question.

INSTRUCTIONS:
- First, identify which passage(s) contain information relevant to the question.
- If multiple passages mention similar topics, carefully distinguish which one actually answers the specific question asked.
- If the context does not contain enough information to answer, say "Not specified in context."
- Give a short, direct final answer — just the name, number, date, or place.

Context:
${context}

Question: ${question}

Think step by step, then give your final answer on a new line starting with "ANSWER: "`;

  const resp = await llmCall({ prompt: cotPrompt, model, temperature: 0.1, maxTokens: 400 });
  const raw = resp.content;

  const answerMatch = raw.match(/ANSWER:\s*(.+)/i);
  if (answerMatch) {
    return {
      answer: answerMatch[1].trim(),
      reasoning: raw.slice(0, raw.indexOf('ANSWER:')).trim(),
      usedMultiHop: false,
      hops: 1,
    };
  }

  if (enableMultiHop && (raw.includes('Not specified') || raw.includes('not enough'))) {
    try {
      const refinedResults = await searchFactsHybrid(
        `${question} ${raw.slice(0, 200)}`,
        config,
        { limit: 5 },
      );
      if (refinedResults.length > 0) {
        const refinedContext = buildContext(refinedResults, charLimit);
        const retryResp = await llmCall({
          prompt: `Given these additional conversation memories, answer the question with ONLY the specific fact requested. Give a short, direct answer.

Context:
${refinedContext}

Question: ${question}

Answer:`,
          model,
          temperature: 0.1,
          maxTokens: 200,
        });
        return {
          answer: retryResp.content.trim(),
          reasoning: `First pass inconclusive. Multi-hop retrieval with refined query.`,
          usedMultiHop: true,
          hops: 2,
        };
      }
    } catch { /* fall through */ }
  }

  const lastLine = raw.split('\n').pop()?.trim() || raw.trim();
  return {
    answer: lastLine,
    reasoning: raw,
    usedMultiHop: false,
    hops: 1,
  };
}
