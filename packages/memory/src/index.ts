/**
 * Zouroboros Memory System
 * 
 * Hybrid SQLite + Vector memory with episodic, procedural, and cognitive capabilities.
 * 
 * @module zouroboros-memory
 */

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
  generateHyDEExpansion,
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

// Import types for internal use
type MemoryConfig = import('zouroboros-core').MemoryConfig;

/**
 * Initialize the memory system
 */
export function init(config: MemoryConfig): void {
  initDatabase(config);
  runMigrations(config);
}

/**
 * Shutdown the memory system
 */
export function shutdown(): void {
  closeDatabase();
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
    database: getDbStats(config),
    episodes: getEpisodeStats(),
  };
}

import { getDbStats } from './database.js';
import { getEpisodeStats } from './episodes.js';
