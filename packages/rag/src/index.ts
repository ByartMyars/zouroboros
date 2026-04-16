/**
 * zouroboros-rag — Retrieval-Augmented Generation for the Zouroboros ecosystem
 *
 * Provides RAG integration across 5 areas:
 * - Swarm: Episode/procedure retrieval for task routing
 * - Vault: Semantic + wikilink graph hybrid search
 * - Autoloop: Experiment history recall
 * - Eval: Prior eval results and AC templates
 * - Persona: Domain-specific fact injection per persona
 *
 * CLI scripts live in ../scripts/ — run with `bun scripts/<name>.ts`
 */

export const RAG_AREAS = [
  "swarm",
  "vault",
  "autoloop",
  "eval",
  "persona",
] as const;

export type RagArea = (typeof RAG_AREAS)[number];

export interface RagConfig {
  id: string;
  area: RagArea;
  description: string;
  retrieval_signal: string;
  fusion_weight: number;
  top_k: number;
  enabled: boolean;
}

import { getMemoryDbPath } from "zouroboros-core";

/**
 * Resolved memory database path.
 *
 * Honors `ZOUROBOROS_MEMORY_DB` / `ZO_MEMORY_DB` env vars and falls back to
 * `~/.zouroboros/memory.db`. Exposed as a getter so tests that mutate env vars
 * at runtime see the updated value.
 */
export const MEMORY_DB_PATH = getMemoryDbPath();
export const OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings";
export const EMBEDDING_MODEL = "nomic-embed-text";
