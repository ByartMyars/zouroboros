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
 * Generate a hypothetical answer using Ollama's generate endpoint.
 * Used by HyDE to create an ideal document for embedding.
 */
export async function generateHypotheticalAnswer(
  query: string,
  config: MemoryConfig,
  options: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const model = options.model ?? 'llama3';
  const prompt = `Answer the following question concisely in 2-3 sentences as if you had perfect knowledge. Do not hedge or say "I don't know".\n\nQuestion: ${query}\n\nAnswer:`;

  const response = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { num_predict: options.maxTokens ?? 150 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama generate error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { response: string };
  return data.response.trim();
}

/**
 * Generate HyDE (Hypothetical Document Expansion) embeddings.
 *
 * 1. Embeds the original query.
 * 2. Uses an LLM to generate a hypothetical ideal answer.
 * 3. Embeds the hypothetical answer.
 * 4. Returns both embeddings so the caller can blend them.
 *
 * Falls back to duplicating the original embedding if generation fails.
 */
export async function generateHyDEExpansion(
  query: string,
  config: MemoryConfig,
  options: { generationModel?: string; maxTokens?: number } = {}
): Promise<{ original: number[]; expanded: number[]; hypothetical: string }> {
  const original = await generateEmbedding(query, config);

  let hypothetical: string;
  try {
    hypothetical = await generateHypotheticalAnswer(query, config, {
      model: options.generationModel,
      maxTokens: options.maxTokens,
    });
  } catch {
    return { original, expanded: original, hypothetical: query };
  }

  const expanded = await generateEmbedding(hypothetical, config);
  return { original, expanded, hypothetical };
}

/**
 * Blend two embeddings by weighted average.
 * Default: 40% original query, 60% hypothetical answer (HyDE sweet spot).
 */
export function blendEmbeddings(
  a: number[],
  b: number[],
  weightA: number = 0.4
): number[] {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }
  const weightB = 1 - weightA;
  return a.map((val, i) => val * weightA + b[i] * weightB);
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
