/**
 * Domain Context Injection for Swarm Orchestrator
 *
 * Detects domain from task text/persona and fetches relevant operational
 * context from the memory system. This supplements RAG enrichment (SDK docs)
 * with domain-specific knowledge (service paths, production topology, etc.).
 *
 * Bridges the gap where PKA session briefings run at conversation level
 * but swarm-dispatched tasks don't carry that context.
 */

import { spawnSync } from 'child_process';

interface DomainDetection {
  domain: string | null;
  confidence: number;
  keywords: string[];
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  ffb: ['fauna', 'flora', 'botanicals', 'ffb', 'skincare', 'beauty', 'shopify', 'fauna-flora', 'product listing'],
  'jhf-trading': ['jhf', 'jackson heritage', 'trading', 'alpaca', 'backtest', 'strategy', 'portfolio', 'crypto'],
  zouroboros: ['zouroboros', 'swarm', 'orchestrator', 'memory system', 'executor', 'seed eval', 'pipeline'],
  infrastructure: ['deploy', 'service', 'hosting', 'ci/cd', 'docker', 'nginx', 'ssl', 'dns'],
};

export function detectDomain(taskText: string, persona?: string): DomainDetection {
  const lowerText = `${taskText} ${persona || ''}`.toLowerCase();

  let bestDomain: string | null = null;
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matched = keywords.filter(kw => lowerText.includes(kw));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestDomain = domain;
      bestKeywords = matched;
    }
  }

  return {
    domain: bestDomain,
    confidence: bestScore > 0 ? Math.min(1, bestScore * 0.3) : 0,
    keywords: bestKeywords,
  };
}

/**
 * Fetches domain-specific operational context from the memory system.
 * Uses the memory CLI to search for relevant facts.
 */
export function fetchDomainContext(domain: string, keywords: string[]): string | null {
  const searchTerms = [...keywords, domain].join(' ');

  try {
    const result = spawnSync('bun', [
      '/home/workspace/Skills/zo-memory-system/scripts/memory.ts',
      'hybrid',
      searchTerms,
      '--limit', '5',
    ], {
      timeout: 5000,
      encoding: 'utf-8',
      cwd: '/home/workspace',
    });

    if (result.status === 0 && result.stdout?.trim()) {
      return `## Domain Context (${domain})\n\n${result.stdout.trim()}\n\n---\n`;
    }
  } catch {
    // Non-blocking — proceed without domain context
  }

  return null;
}

/**
 * Enriches tasks with domain-specific context from the memory system.
 * Call this after RAG enrichment for comprehensive context injection.
 */
export function enrichTasksWithDomainContext(
  tasks: Array<{ id: string; task: string; persona?: string }>,
): { enrichedCount: number; domain: string | null } {
  if (tasks.length === 0) return { enrichedCount: 0, domain: null };

  // Detect domain from all task text combined for better signal
  const combinedText = tasks.map(t => t.task).join(' ');
  const combinedPersona = tasks.map(t => t.persona || '').join(' ');
  const detection = detectDomain(combinedText, combinedPersona);

  if (!detection.domain || detection.confidence < 0.3) {
    return { enrichedCount: 0, domain: null };
  }

  const context = fetchDomainContext(detection.domain, detection.keywords);
  if (!context) {
    return { enrichedCount: 0, domain: detection.domain };
  }

  let enrichedCount = 0;
  for (const task of tasks) {
    // Only inject if this task is relevant to the detected domain
    const taskDetection = detectDomain(task.task, task.persona);
    if (taskDetection.domain === detection.domain || detection.confidence >= 0.6) {
      task.task = context + task.task;
      enrichedCount++;
    }
  }

  return { enrichedCount, domain: detection.domain };
}
