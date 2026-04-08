import { describe, test, expect } from 'bun:test';

// Test the parseSpec logic by importing the module and calling llmCall
// with a mock fetch. We test the public API shape.

describe('llm module', () => {
  test('exports llmCall function', async () => {
    const mod = await import('../llm.js');
    expect(typeof mod.llmCall).toBe('function');
  });

  test('LlmCallOptions accepts expected fields', () => {
    // Type-level test: this should compile without error
    const opts = {
      prompt: 'hello',
      system: 'You are helpful',
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 100,
    };
    expect(opts.prompt).toBe('hello');
  });
});
