/**
 * MCP (Model Context Protocol) server for Zouroboros Memory
 *
 * Exposes memory operations as MCP tools accessible by external
 * AI agents and clients via stdio transport.
 *
 * Usage: bun run packages/memory/src/mcp-server.ts [--db-path <path>]
 */

import { initDatabase, closeDatabase, getDbStats } from './database.js';
import { storeFact, searchFacts, searchFactsHybrid, getFact, deleteFact, cleanupExpiredFacts } from './facts.js';
import { createEpisode, searchEpisodes, getEntityEpisodes, getEpisodeStats } from './episodes.js';
import { getProfile, updateTraits, updatePreferences, recordInteraction, getProfileSummary, listProfiles } from './profiles.js';
import { ensureProfileSchema } from './profiles.js';
import { buildEntityGraph, getRelatedEntities } from './graph.js';
import { extractFromText } from './capture.js';
import type { MemoryConfig } from 'zouroboros-core';

// ============================================================================
// MCP Protocol Types (subset)
// ============================================================================

interface McpRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: McpToolDefinition[] = [
  {
    name: 'memory_store',
    description: 'Store a fact in memory with optional embedding generation',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'The entity this fact is about' },
        value: { type: 'string', description: 'The fact content' },
        key: { type: 'string', description: 'Optional key for the fact' },
        category: { type: 'string', enum: ['preference', 'fact', 'decision', 'convention', 'other', 'reference', 'project'] },
        decay: { type: 'string', enum: ['permanent', 'long', 'medium', 'short'] },
        importance: { type: 'number', description: 'Importance score (default 1.0)' },
      },
      required: ['entity', 'value'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search facts by keyword or semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        entity: { type: 'string', description: 'Filter by entity' },
        category: { type: 'string', description: 'Filter by category' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        mode: { type: 'string', enum: ['keyword', 'hybrid'], description: 'Search mode (default keyword)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_episodes',
    description: 'Search or create episodic memories',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'create', 'entity'], description: 'Action to perform' },
        summary: { type: 'string', description: 'Episode summary (for create)' },
        outcome: { type: 'string', enum: ['success', 'failure', 'resolved', 'ongoing'] },
        entities: { type: 'array', items: { type: 'string' }, description: 'Related entities' },
        entity: { type: 'string', description: 'Entity to search episodes for (for entity action)' },
        since: { type: 'string', description: 'ISO date filter (for search)' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['action'],
    },
  },
  {
    name: 'cognitive_profile',
    description: 'Get or update cognitive profiles for entities',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'update_traits', 'update_preferences', 'summary', 'list'] },
        entity: { type: 'string', description: 'Entity name' },
        traits: { type: 'object', description: 'Traits to update (name → score)' },
        preferences: { type: 'object', description: 'Preferences to update (key → value)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'memory_graph',
    description: 'Query the entity relationship graph',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['related', 'build'], description: 'Graph action' },
        entity: { type: 'string', description: 'Entity to find relations for' },
        depth: { type: 'number', description: 'Traversal depth (default 2)' },
        limit: { type: 'number', description: 'Max related entities (default 20)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'memory_stats',
    description: 'Get memory system statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  config: MemoryConfig
): Promise<unknown> {
  switch (name) {
    case 'memory_store': {
      const result = await storeFact({
        entity: args.entity as string,
        value: args.value as string,
        key: args.key as string | undefined,
        category: args.category as any,
        decay: args.decay as any,
        importance: args.importance as number | undefined,
        source: 'mcp',
      }, config);
      return { stored: true, id: result.id, entity: result.entity };
    }

    case 'memory_search': {
      const mode = (args.mode as string) ?? 'keyword';
      if (mode === 'hybrid') {
        return searchFactsHybrid(args.query as string, config, {
          limit: args.limit as number | undefined,
        });
      }
      return searchFacts(args.query as string, {
        entity: args.entity as string | undefined,
        category: args.category as string | undefined,
        limit: args.limit as number | undefined,
      });
    }

    case 'memory_episodes': {
      const action = args.action as string;
      if (action === 'create') {
        return createEpisode({
          summary: args.summary as string,
          outcome: (args.outcome as any) ?? 'ongoing',
          entities: (args.entities as string[]) ?? ['system'],
        });
      }
      if (action === 'entity') {
        return getEntityEpisodes(args.entity as string, {
          limit: args.limit as number | undefined,
        });
      }
      return searchEpisodes({
        since: args.since as string | undefined,
        outcome: args.outcome as string | undefined,
        limit: args.limit as number | undefined,
      });
    }

    case 'cognitive_profile': {
      const action = args.action as string;
      if (action === 'list') return listProfiles();
      if (action === 'summary') return getProfileSummary(args.entity as string);
      if (action === 'update_traits') {
        updateTraits(args.entity as string, args.traits as Record<string, number>);
        return { updated: true };
      }
      if (action === 'update_preferences') {
        updatePreferences(args.entity as string, args.preferences as Record<string, string>);
        return { updated: true };
      }
      return getProfile(args.entity as string);
    }

    case 'memory_graph': {
      const action = args.action as string;
      if (action === 'build') return buildEntityGraph();
      return getRelatedEntities(args.entity as string, {
        depth: args.depth as number | undefined,
        limit: args.limit as number | undefined,
      });
    }

    case 'memory_stats': {
      const dbStats = getDbStats(config);
      const epStats = getEpisodeStats();
      return { database: dbStats, episodes: epStats };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// MCP Server (stdio transport)
// ============================================================================

function createResponse(id: number | string, result: unknown): McpResponse {
  return { jsonrpc: '2.0', id, result };
}

function createError(id: number | string, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleMessage(
  message: McpRequest,
  config: MemoryConfig
): Promise<McpResponse> {
  try {
    switch (message.method) {
      case 'initialize':
        return createResponse(message.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'zouroboros-memory', version: '2.0.0' },
        });

      case 'tools/list':
        return createResponse(message.id, { tools: TOOLS });

      case 'tools/call': {
        const params = message.params as { name: string; arguments: Record<string, unknown> };
        const result = await handleToolCall(params.name, params.arguments ?? {}, config);
        return createResponse(message.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      }

      case 'notifications/initialized':
        // Client ack — no response needed for notifications, but return empty
        return createResponse(message.id, {});

      default:
        return createError(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (err) {
    return createError(
      message.id,
      -32000,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Start the MCP server on stdio.
 */
export async function startMcpServer(config: MemoryConfig): Promise<void> {
  // Initialize database
  initDatabase(config);
  ensureProfileSchema();

  const decoder = new TextDecoder();
  let buffer = '';

  process.stdin.resume();
  process.stdin.on('data', async (chunk: Buffer) => {
    buffer += decoder.decode(chunk, { stream: true });

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request: McpRequest = JSON.parse(trimmed);
        const response = await handleMessage(request, config);

        // Don't respond to notifications (no id)
        if (request.id !== undefined) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch {
        // Skip malformed messages
      }
    }
  });

  process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
  });
}

// CLI entrypoint
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dbPathIdx = args.indexOf('--db-path');
  const dbPath = dbPathIdx >= 0 ? args[dbPathIdx + 1] : undefined;

  const config: MemoryConfig = {
    enabled: true,
    dbPath: dbPath ?? `${process.env.HOME}/.zouroboros/memory.db`,
    vectorEnabled: false,
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'nomic-embed-text',
    autoCapture: false,
    captureIntervalMinutes: 30,
    graphBoost: true,
    hydeExpansion: false,
    decayConfig: { permanent: Infinity, long: 365, medium: 90, short: 30 },
  };

  startMcpServer(config);
}
