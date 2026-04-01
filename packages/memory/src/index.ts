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

export const VERSION = '2.0.0';

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

// Re-export types
export type {
  MemoryEntry,
  MemorySearchResult,
  EpisodicMemory,
  TemporalQuery,
  CognitiveProfile,
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
