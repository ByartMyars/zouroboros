/**
 * RAG Enrichment Module for Swarm Orchestrator
 *
 * Enriches task prompts with relevant SDK documentation from the
 * Agentic RAG system (19 indexed SDKs, 95 documents).
 *
 * Local-first: Uses Ollama (nomic-embed-text) + Qdrant (vector DB).
 * Zero API costs, unlimited RPM.
 *
 * Ported from scripts/rag-enrichment.ts for package integration.
 */

interface RAGResult {
  content: string;
  sdk: string;
  source: string;
  score: number;
}

export interface RAGEnrichmentOptions {
  topK?: number;
  minScore?: number;
  sdks?: string[];
  includeCode?: boolean;
}

const ZOUROBOROS_SDKS = [
  'claude-sdk', 'langchain', 'openai-agents', 'crewai', 'adk',
  'llamaindex', 'pydantic-ai', 'autogen', 'dspy', 'instructor',
  'langgraph', 'semantic-kernel', 'hono', 'mcp-sdk', 'qdrant',
  'bun', 'drizzle-orm', 'stripe', 'airtable',
];

const RAG_TRIGGER_KEYWORDS = [
  'agent', 'llm', 'model', 'embedding', 'vector', 'rag', 'memory',
  'api', 'route', 'middleware', 'validation', 'schema',
  'database', 'orm', 'query', 'migration',
  'payment', 'stripe', 'subscription',
  'workflow', 'orchestration', 'handoff', 'tool',
  'streaming', 'async', 'concurrent',
];

export function shouldEnrichWithRAG(taskText: string): boolean {
  const lowerText = taskText.toLowerCase();
  return RAG_TRIGGER_KEYWORDS.some(kw => lowerText.includes(kw));
}

async function getOllamaEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/embeddings';
  const response = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  });
  if (!response.ok) throw new Error(`Ollama embedding failed: ${response.status}`);
  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

async function searchQdrant(
  embedding: number[],
  options: RAGEnrichmentOptions = {},
): Promise<RAGResult[]> {
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantKey = process.env.QDRANT_API_KEY;
  if (!qdrantUrl) throw new Error('QDRANT_URL not configured');

  const topK = options.topK || 3;
  const minScore = options.minScore || 0.5;

  const response = await fetch(`${qdrantUrl}/collections/code-docs/points/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': qdrantKey || '',
    },
    body: JSON.stringify({ vector: embedding, limit: topK, with_payload: true }),
  });
  if (!response.ok) throw new Error(`Qdrant search failed: ${response.status}`);

  const data = await response.json() as {
    result: Array<{
      id: string;
      score: number;
      payload: { content: string; sdk: string; source: string };
    }>;
  };

  return data.result
    .filter(point => point.score >= minScore)
    .map(point => ({
      content: point.payload.content,
      sdk: point.payload.sdk,
      source: point.payload.source,
      score: point.score,
    }));
}

function getZouroborosContext(sdk: string): string {
  const contexts: Record<string, string> = {
    'claude-sdk': 'Anthropic Claude API for complex reasoning and agent responses',
    'langchain': 'Workflow composition and chain orchestration',
    'openai-agents': 'Lightweight multi-agent with handoffs and tools',
    'crewai': 'Role-based agent teams for project workflows',
    'adk': 'Google ADK with built-in tool integrations',
    'llamaindex': 'Advanced RAG with document indexing and retrieval',
    'pydantic-ai': 'Type-safe structured outputs with validation',
    'autogen': 'Conversational agents with code execution',
    'dspy': 'Prompt optimization and programmatic LLM control',
    'instructor': 'Structured outputs with retry logic',
    'langgraph': 'State machine-based agent workflows',
    'semantic-kernel': 'Microsoft AI SDK for enterprise integration',
    'hono': 'Fast, lightweight web framework for Zo Space APIs',
    'mcp-sdk': 'Model Context Protocol for AI tool integration',
    'qdrant': 'Vector database for embeddings and semantic search',
    'bun': 'Fast JavaScript/TypeScript runtime',
    'drizzle-orm': 'Type-safe SQL-like ORM for database operations',
    'stripe': 'Payment processing and subscription management',
    'airtable': 'Database and CRM integration',
  };
  return contexts[sdk] || 'SDK documentation';
}

function formatRAGContext(results: RAGResult[]): string {
  if (results.length === 0) return '';

  const sections = results.map((r, i) => {
    const context = getZouroborosContext(r.sdk);
    const lang = r.sdk.startsWith('bun') || r.sdk === 'hono' || r.sdk === 'drizzle-orm' ? 'typescript' : 'python';
    return `### Pattern ${i + 1}: ${r.sdk} — ${r.source.replace('.md', '')}
**Relevance:** ${(r.score * 100).toFixed(1)}% | **Use Case:** ${context}

\`\`\`${lang}
${r.content.slice(0, 800)}${r.content.length > 800 ? '...' : ''}
\`\`\``;
  });

  return `## Relevant SDK Patterns from Zouroboros Knowledge Base

The following patterns may be helpful for this task. Use them as reference for implementation:

${sections.join('\n\n')}

---
`;
}

export async function enrichTaskWithRAG(
  taskText: string,
  options: RAGEnrichmentOptions = {},
): Promise<{ context: string; latencyMs: number; patterns: number }> {
  const startTime = Date.now();

  if (!shouldEnrichWithRAG(taskText)) {
    return { context: '', latencyMs: 0, patterns: 0 };
  }

  try {
    const embedding = await getOllamaEmbedding(taskText);
    const results = await searchQdrant(embedding, {
      topK: options.topK || 3,
      minScore: options.minScore || 0.5,
      ...options,
    });

    if (results.length === 0) {
      return { context: '', latencyMs: Date.now() - startTime, patterns: 0 };
    }

    const context = formatRAGContext(results);
    return { context, latencyMs: Date.now() - startTime, patterns: results.length };
  } catch (error) {
    console.log(`  [RAG] Enrichment failed (non-blocking): ${error}`);
    return { context: '', latencyMs: Date.now() - startTime, patterns: 0 };
  }
}

export async function prefetchRAGForTasks(
  tasks: Array<{ id: string; task: string }>,
  options: RAGEnrichmentOptions = {},
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const concurrency = 3;
  const queue = [...tasks];

  async function processBatch() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      if (shouldEnrichWithRAG(item.task)) {
        const { context } = await enrichTaskWithRAG(item.task, options);
        if (context) results.set(item.id, context);
      }
    }
  }

  await Promise.all(Array(concurrency).fill(null).map(processBatch));
  return results;
}
