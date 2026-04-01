import { describe, test, expect } from 'bun:test';
import {
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  blendEmbeddings,
} from '../embeddings.js';

describe('cosineSimilarity', () => {
  test('identical vectors return 1', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  test('orthogonal vectors return 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test('opposite vectors return -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  test('throws on mismatched dimensions', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('same length');
  });
});

describe('serializeEmbedding / deserializeEmbedding', () => {
  test('round-trips embedding data', () => {
    const original = [0.1, 0.2, 0.3, -0.5, 1.0];
    const serialized = serializeEmbedding(original);
    const deserialized = deserializeEmbedding(serialized);

    expect(deserialized.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(deserialized[i]).toBeCloseTo(original[i], 5);
    }
  });

  test('handles empty embeddings', () => {
    const serialized = serializeEmbedding([]);
    const deserialized = deserializeEmbedding(serialized);
    expect(deserialized).toEqual([]);
  });
});

describe('blendEmbeddings', () => {
  test('default 40/60 blend', () => {
    const a = [1.0, 0.0, 0.0];
    const b = [0.0, 1.0, 0.0];
    const blended = blendEmbeddings(a, b);
    expect(blended[0]).toBeCloseTo(0.4, 5);
    expect(blended[1]).toBeCloseTo(0.6, 5);
    expect(blended[2]).toBeCloseTo(0.0, 5);
  });

  test('equal blend with weight 0.5', () => {
    const a = [2.0, 0.0];
    const b = [0.0, 4.0];
    const blended = blendEmbeddings(a, b, 0.5);
    expect(blended[0]).toBeCloseTo(1.0, 5);
    expect(blended[1]).toBeCloseTo(2.0, 5);
  });

  test('weight 1.0 returns first embedding', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const blended = blendEmbeddings(a, b, 1.0);
    expect(blended).toEqual([1, 2, 3]);
  });

  test('weight 0.0 returns second embedding', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const blended = blendEmbeddings(a, b, 0.0);
    expect(blended).toEqual([4, 5, 6]);
  });

  test('throws on mismatched dimensions', () => {
    expect(() => blendEmbeddings([1], [1, 2])).toThrow('same dimension');
  });
});
