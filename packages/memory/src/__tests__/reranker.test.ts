import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { MemoryConfig, MemorySearchResult } from 'zouroboros-core';

const TEST_CONFIG: MemoryConfig = {
  enabled: true,
  dbPath: ':memory:',
  vectorEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  autoCapture: false,
  captureIntervalMinutes: 30,
  graphBoost: false,
  hydeExpansion: false,
  decayConfig: { permanent: 99999, long: 365, medium: 90, short: 30 },
  reranker: { enabled: true, model: 'gpt-4o-mini', maxContextChunks: 3 },
};

function makeResult(id: string, value: string, score: number): MemorySearchResult {
  return {
    entry: {
      id,
      entity: 'test',
      key: null,
      value,
      decay: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    score,
    matchType: 'hybrid',
  };
}

// We mock the llm module to avoid real API calls
let mockLlmResponse = '3,1,5';
let mockLlmCallCount = 0;

mock.module('../llm.js', () => ({
  llmCall: async () => {
    mockLlmCallCount++;
    return { content: mockLlmResponse, latencyMs: 50, provider: 'openai', model: 'gpt-4o-mini' };
  },
}));

// Must import AFTER mock setup
const { rerankResults } = await import('../reranker.js');

beforeEach(() => {
  mockLlmCallCount = 0;
  mockLlmResponse = '3,1,5';
});

describe('rerankResults', () => {
  test('returns all results unchanged when count <= topK', async () => {
    const results = [makeResult('a', 'alpha', 0.9), makeResult('b', 'beta', 0.8)];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 3);
    expect(reranked).toEqual(results);
    expect(mockLlmCallCount).toBe(0);
  });

  test('reorders results based on LLM response', async () => {
    mockLlmResponse = '3,1';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 2);
    expect(reranked.length).toBe(2);
    expect(reranked[0].entry.id).toBe('c');
    expect(reranked[1].entry.id).toBe('a');
  });

  test('fills remaining slots when LLM returns fewer than topK', async () => {
    mockLlmResponse = '2';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
      makeResult('d', 'delta', 0.6),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 3);
    expect(reranked.length).toBe(3);
    expect(reranked[0].entry.id).toBe('b');
  });

  test('uses maxContextChunks from config when topK not specified', async () => {
    mockLlmResponse = '2,3,1';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
      makeResult('d', 'delta', 0.6),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG);
    expect(reranked.length).toBe(3); // maxContextChunks = 3
  });

  test('handles malformed LLM output by falling back to truncation', async () => {
    mockLlmResponse = 'I cannot determine relevance without more context.';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
      makeResult('d', 'delta', 0.6),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 2);
    expect(reranked.length).toBe(2);
    expect(reranked[0].entry.id).toBe('a');
    expect(reranked[1].entry.id).toBe('b');
  });

  test('deduplicates indices from LLM response', async () => {
    mockLlmResponse = '2,2,3,2';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
      makeResult('d', 'delta', 0.6),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 3);
    expect(reranked.length).toBe(3);
    expect(reranked[0].entry.id).toBe('b');
    expect(reranked[1].entry.id).toBe('c');
  });

  test('filters out-of-range indices', async () => {
    mockLlmResponse = '99,0,2';
    const results = [
      makeResult('a', 'alpha', 0.9),
      makeResult('b', 'beta', 0.8),
      makeResult('c', 'charlie', 0.7),
    ];
    const reranked = await rerankResults('test query', results, TEST_CONFIG, 2);
    expect(reranked.length).toBe(2);
    expect(reranked[0].entry.id).toBe('b');
  });
});
