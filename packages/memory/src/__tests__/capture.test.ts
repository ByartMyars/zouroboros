import { describe, test, expect } from 'bun:test';
import { extractFromText } from '../capture.js';

describe('extractFromText', () => {
  test('extracts "X is Y" facts', () => {
    const result = extractFromText('Zouroboros is a self-enhancing AI system. Node is a runtime.');
    expect(result.facts.length).toBeGreaterThanOrEqual(1);
    const zoFact = result.facts.find(f => f.entity === 'Zouroboros');
    expect(zoFact).toBeDefined();
    expect(zoFact!.value).toContain('self-enhancing');
  });

  test('extracts "X uses Y" facts', () => {
    const result = extractFromText('The memory system uses SQLite for storage.');
    const fact = result.facts.find(f => f.value.includes('SQLite'));
    expect(fact).toBeDefined();
  });

  test('extracts decision patterns', () => {
    const result = extractFromText('We decided to use Bun instead of Node for performance.');
    const decisions = result.facts.filter(f => f.category === 'decision');
    expect(decisions.length).toBeGreaterThanOrEqual(1);
  });

  test('extracts success episodes', () => {
    const result = extractFromText('Completed the migration to SQLite WAL mode.');
    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
    expect(result.episodes[0].outcome).toBe('success');
  });

  test('extracts failure episodes', () => {
    const result = extractFromText('Failed to connect to the Ollama server.');
    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
    expect(result.episodes[0].outcome).toBe('failure');
  });

  test('deduplicates extracted items', () => {
    const text = 'Zouroboros is great. Zouroboros is great.';
    const result = extractFromText(text);
    // Same fact should only appear once
    const zoFacts = result.facts.filter(f => f.entity === 'Zouroboros');
    expect(zoFacts.length).toBeLessThanOrEqual(1);
  });

  test('handles empty text', () => {
    const result = extractFromText('');
    expect(result.facts.length).toBe(0);
    expect(result.episodes.length).toBe(0);
  });

  test('handles text with no extractable content', () => {
    const result = extractFromText('hello world this is just plain text');
    expect(result.facts.length).toBe(0);
    expect(result.episodes.length).toBe(0);
  });
});
