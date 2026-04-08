/**
 * Zouroboros Memory System
 *
 * Hybrid SQLite + Vector memory with episodic, procedural, and cognitive capabilities.
 *
 * @module zouroboros-memory
 */

import { initDatabase as _initDb, closeDatabase as _closeDb, runMigrations as _runMigrations, getDbStats as _getDbStats } from './database.js';
import { getEpisodeStats as _getEpisodeStats } from './episodes.js';
import { ensureProfileSchema as _ensureProfileSchema } from './profiles.js';

export const VERSION = '3.0.0';

// Database
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  isInitialized,
  runMigrations,
  getDbStats,
} from './database.js';

// Embeddings
export {
  generateEmbedding,
  generateHypotheticalAnswer,
  generateHyDEExpansion,
  blendEmbeddings,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  checkOllamaHealth,
  listAvailableModels,
} from './embeddings.js';

// Facts
export {
  storeFact,
  searchFacts,
  searchFactsVector,
  searchFactsHybrid,
  getFact,
  deleteFact,
  touchFact,
  cleanupExpiredFacts,
} from './facts.js';

// Episodes
export {
  createEpisode,
  searchEpisodes,
  getEntityEpisodes,
  updateEpisodeOutcome,
  getEpisodeStats,
} from './episodes.js';

// Graph
export {
  buildEntityGraph,
  getRelatedEntities,
  searchFactsGraphBoosted,
  extractQueryEntities,
  invalidateGraphCache,
} from './graph.js';

// Cognitive Profiles
export {
  getProfile,
  updateTraits,
  updatePreferences,
  recordInteraction,
  getRecentInteractions,
  getProfileSummary,
  listProfiles,
  deleteProfile,
  ensureProfileSchema,
} from './profiles.js';

// Auto-capture
export {
  extractFromText,
  autoCapture,
  bufferForCapture,
  startAutoCapture,
  stopAutoCapture,
  getCaptureBufferSize,
} from './capture.js';
export type { CaptureResult, CaptureOptions } from './capture.js';

// MCP Server
export { handleMessage, startMcpServer } from './mcp-server.js';

// v4 Enhancements — Context Budget (MEM-001)
export {
  estimateTokens,
  estimateFactTokens,
  getBudget,
  updateBudget,
  resetBudget,
  initBudget,
  planCompression,
  createCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  retrievalWithBudget,
} from './context-budget.js';
export type {
  ContextBudget,
  BudgetCheckpoint,
  CompressedFact,
  BudgetMetrics,
  CompressionPlan,
  RetrievalBudgetResult,
} from './context-budget.js';

// v4 Enhancements — Episode Summarizer (MEM-002)
export {
  compressEpisodes,
  getCompressedEpisode,
  listCompressedEpisodes,
  shouldSummarize,
} from './episode-summarizer.js';
export type {
  CompressedEpisode,
  SummarizationResult,
  EpisodeForCompression,
  ShouldSummarizeResult,
} from './episode-summarizer.js';

// v4 Enhancements — Metrics Dashboard (MEM-101)
export {
  recordSearchOperation,
  recordCaptureOperation,
  recordGateDecision,
  collectMetrics,
  printReport,
} from './metrics.js';
export type {
  MemoryMetrics,
  CaptureStats,
  SearchMetrics,
  OperationStats,
  GateMetrics,
} from './metrics.js';

// v4 Enhancements — Multi-Hop Retrieval (MEM-003)
export type {
  HopResult,
  MultiHopResult,
} from './multi-hop.js';

// v4 Enhancements — Conflict Resolver (MEM-103)
export {
  isContradiction,
  findEntityConflicts,
  detectNewConflict,
  resolveConflict,
  resolveAllPending,
  trackProvenance,
  getProvenance,
  getFactHistory,
} from './conflict-resolver.js';
export type {
  ConflictType,
  ResolutionStrategy,
  ConflictRecord,
  ProvenanceRecord,
} from './conflict-resolver.js';

// v4 Enhancements — Cross-Persona Memory (MEM-104)
export {
  listPools,
  createPool,
  addToPool,
  removeFromPool,
  setInheritance,
  getAccessiblePersonas,
  searchCrossPersona,
} from './cross-persona.js';
export type {
  SharedPool,
  PersonaNode,
} from './cross-persona.js';

// v4 Enhancements — Graph Traversal (MEM-105)
export {
  getAncestors,
  getDescendants,
  detectCycles,
  inferRelations,
  exportDot,
  KNOWN_RELATIONS,
} from './graph-traversal.js';

// v4 Enhancements — Embedding Benchmark (MEM-202)
// Note: embedding-benchmark.ts is a standalone CLI tool, not re-exported as library API.
// Run directly: bun packages/memory/src/embedding-benchmark.ts

// v4 Enhancements — Import Pipeline (MEM-102)
// Note: import-pipeline.ts is a standalone CLI tool, not re-exported as library API.
// Run directly: bun packages/memory/src/import-pipeline.ts --source <type> --path <path>

// v5 Enhancement — LLM Reranker (MEM-301)
export { rerankResults } from './reranker.js';

// v5 Enhancement — Chain-of-Thought Answer (MEM-302)
export { answerWithCoT } from './cot-answer.js';

// v5 Enhancement — LLM Client (internal, exported for testing)
export { llmCall } from './llm.js';
export type { LlmCallOptions, LlmCallResult } from './llm.js';

// Re-export types
export type {
  MemoryEntry,
  MemorySearchResult,
  EpisodicMemory,
  TemporalQuery,
  CognitiveProfile,
  CotAnswerResult,
  DeepSearchResult,
  GraphNode,
  GraphEdge,
} from 'zouroboros-core';

type MemoryConfig = import('zouroboros-core').MemoryConfig;

/**
 * Initialize the memory system
 */
export function init(config: MemoryConfig): void {
  _initDb(config);
  _runMigrations(config);
  _ensureProfileSchema();
}

/**
 * Shutdown the memory system
 */
export function shutdown(): void {
  _closeDb();
}

/**
 * Get memory system statistics
 */
export function getStats(config: MemoryConfig): {
  database: {
    facts: number;
    episodes: number;
    procedures: number;
    openLoops: number;
    embeddings: number;
  };
  episodes: {
    total: number;
    byOutcome: Record<string, number>;
  };
} {
  return {
    database: _getDbStats(config),
    episodes: _getEpisodeStats(),
  };
}
