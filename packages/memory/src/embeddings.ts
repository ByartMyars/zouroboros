/**
 * Vector embeddings for semantic search
 */

import type { MemoryConfig } from 'zouroboros-core';

/**
 * Generate embeddings for text using Ollama
 */
export async function generateEmbedding(
  text: string,
  config: MemoryConfig
): Promise<number[]> {
  if (!config.vectorEnabled) {
    throw new Error('Vector search is disabled in configuration');
  }

  const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

/**
 * Generate HyDE (Hypothetical Document Expansion) query
 * 
 * Creates an expanded query by generating a hypothetical ideal answer,
 * then embedding both the query and the hypothetical answer.
 */
export async function generateHyDEExpansion(
  query: string,
  config: MemoryConfig
): Promise<{ original: number[]; expanded: number[] }> {
  // Generate embedding for original query
  const original = await generateEmbedding(query, config);

  // Generate hypothetical answer (simplified - in production, use an LLM)
  // For now, we'll just use the original query
  const hypotheticalAnswer = query;
  const expanded = await generateEmbedding(hypotheticalAnswer, config);

  return { original, expanded };
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Serialize embedding for SQLite storage
 */
export function serializeEmbedding(embedding: number[]): Buffer {
  // Convert to Float32Array and then to Buffer
  const floatArray = new Float32Array(embedding);
  return Buffer.from(floatArray.buffer);
}

/**
 * Deserialize embedding from SQLite storage
 */
export function deserializeEmbedding(buffer: Buffer): number[] {
  const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  return Array.from(floatArray);
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaHealth(config: MemoryConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available models from Ollama
 */
export async function listAvailableModels(config: MemoryConfig): Promise<string[]> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`);
    if (!response.ok) return [];
    
    const data = await response.json() as { models?: { name: string }[] };
    return data.models?.map(m => m.name) || [];
  } catch {
    return [];
  }
}
