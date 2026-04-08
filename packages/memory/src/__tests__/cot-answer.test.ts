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
  cot: { enabled: true, model: 'gpt-4o-mini' },
};

function makeResult(value: string, score: number): MemorySearchResult {
  return {
    entry: {
      id: `id-${Math.random().toString(36).slice(2)}`,
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

let mockResponses: string[] = [];
let mockCallCount = 0;

mock.module('../llm.js', () => ({
  llmCall: async () => {
    const content = mockResponses[mockCallCount] || 'Unknown';
    mockCallCount++;
    return { content, latencyMs: 50, provider: 'openai', model: 'gpt-4o-mini' };
  },
}));

// Mock searchFactsHybrid to avoid DB dependency
mock.module('../facts.js', () => ({
  searchFactsHybrid: async () => [
    makeResult('Multi-hop result: The answer is Paris', 0.9),
  ],
}));

const { answerWithCoT } = await import('../cot-answer.js');

beforeEach(() => {
  mockCallCount = 0;
  mockResponses = [];
});

describe('answerWithCoT', () => {
  test('extracts answer from ANSWER: marker', async () => {
    mockResponses = [
      'The user mentioned their dog is named Max in passage 2.\n\nANSWER: Max',
    ];
    const results = [makeResult('My dog Max is a golden retriever', 0.9)];
    const answer = await answerWithCoT('What is the dog\'s name?', results, TEST_CONFIG);
    expect(answer.answer).toBe('Max');
    expect(answer.usedMultiHop).toBe(false);
    expect(answer.hops).toBe(1);
    expect(answer.reasoning).toContain('passage 2');
  });

  test('triggers multi-hop when first pass says not specified', async () => {
    mockResponses = [
      'Not specified in context.',
      'Paris',
    ];
    const results = [makeResult('Some unrelated memory', 0.5)];
    const answer = await answerWithCoT('Where did they go?', results, {
      ...TEST_CONFIG,
      cot: { enabled: true, multiHopFallback: true },
    });
    expect(answer.usedMultiHop).toBe(true);
    expect(answer.hops).toBe(2);
    expect(answer.answer).toBe('Paris');
  });

  test('respects contextCharLimit', async () => {
    mockResponses = ['ANSWER: Truncated'];
    const longValue = 'x'.repeat(5000);
    const results = [makeResult(longValue, 0.9)];
    const answer = await answerWithCoT('test', results, TEST_CONFIG, {
      contextCharLimit: 100,
    });
    expect(answer.answer).toBe('Truncated');
    expect(mockCallCount).toBe(1);
  });

  test('falls back to last line when no ANSWER marker', async () => {
    mockResponses = [
      'I think the answer might be Berlin based on passage 1.\nBerlin',
    ];
    const results = [makeResult('Trip to Berlin last summer', 0.9)];
    const answer = await answerWithCoT('Where was the trip?', results, TEST_CONFIG);
    expect(answer.answer).toBe('Berlin');
    expect(answer.usedMultiHop).toBe(false);
  });

  test('handles empty results gracefully', async () => {
    mockResponses = ['Not specified in context.'];
    const answer = await answerWithCoT('What color?', [], {
      ...TEST_CONFIG,
      cot: { enabled: true, multiHopFallback: false },
    });
    expect(answer.answer).toBeTruthy();
    expect(answer.usedMultiHop).toBe(false);
  });

  test('skips multi-hop when disabled in config', async () => {
    mockResponses = ['Not specified in context.'];
    const results = [makeResult('Some memory', 0.5)];
    const answer = await answerWithCoT('Unknown question', results, {
      ...TEST_CONFIG,
      cot: { enabled: true, multiHopFallback: false },
    });
    expect(answer.usedMultiHop).toBe(false);
    expect(mockCallCount).toBe(1);
  });
});
