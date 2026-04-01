/**
 * ECC-003: Session Management
 *
 * Active session capabilities: branching, search, compaction, and metrics.
 * Persists to disk (JSON file) matching selfheal persistence pattern.
 * Integrates with hook system for lifecycle events.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { HookSystem } from './hooks.js';

export interface Session {
  id: string;
  parentId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  metadata: Record<string, unknown>;
  metrics: SessionMetrics;
  entries: SessionEntry[];
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived' | 'branched';

export interface SessionEntry {
  id: string;
  timestamp: string;
  type: 'message' | 'tool_call' | 'tool_result' | 'checkpoint' | 'note';
  content: string;
  tokens?: number;
  tags?: string[];
}

export interface SessionMetrics {
  totalTokens: number;
  entryCount: number;
  toolCalls: number;
  duration: number; // ms from first to last entry
  checkpoints: number;
}

export interface SessionSearchResult {
  sessionId: string;
  entryId: string;
  content: string;
  score: number;
  timestamp: string;
}

export interface CompactionResult {
  sessionId: string;
  entriesBefore: number;
  entriesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  summary: string;
}

interface SessionStore {
  version: string;
  sessions: Session[];
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private dataFile: string | null = null;
  private hooks: HookSystem | null = null;

  constructor(dataDir?: string) {
    if (dataDir) {
      mkdirSync(dataDir, { recursive: true });
      this.dataFile = join(dataDir, 'sessions.json');
      this.load();
    }
  }

  wireHooks(hooks: HookSystem): void {
    this.hooks = hooks;
  }

  create(name: string, metadata: Record<string, unknown> = {}): Session {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      metadata,
      metrics: { totalTokens: 0, entryCount: 0, toolCalls: 0, duration: 0, checkpoints: 0 },
      entries: [],
    };
    this.sessions.set(id, session);
    this.save();
    return session;
  }

  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  list(filter?: { status?: SessionStatus }): Session[] {
    let sessions = [...this.sessions.values()];
    if (filter?.status) {
      sessions = sessions.filter(s => s.status === filter.status);
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  addEntry(sessionId: string, entry: Omit<SessionEntry, 'id'>): SessionEntry | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const fullEntry: SessionEntry = {
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
    };

    session.entries.push(fullEntry);
    session.updatedAt = new Date().toISOString();

    // Update metrics
    session.metrics.entryCount = session.entries.length;
    if (entry.tokens) session.metrics.totalTokens += entry.tokens;
    if (entry.type === 'tool_call') session.metrics.toolCalls++;
    if (entry.type === 'checkpoint') session.metrics.checkpoints++;

    if (session.entries.length >= 2) {
      const first = new Date(session.entries[0].timestamp).getTime();
      const last = new Date(fullEntry.timestamp).getTime();
      session.metrics.duration = last - first;
    }

    this.save();
    return fullEntry;
  }

  branch(sessionId: string, branchName: string, options?: { fromEntryIndex?: number; freezeParent?: boolean }): Session | null {
    const parent = this.sessions.get(sessionId);
    if (!parent) return null;

    const fromEntryIndex = options?.fromEntryIndex;
    const freezeParent = options?.freezeParent ?? false;

    const entrySlice = fromEntryIndex !== undefined
      ? parent.entries.slice(0, fromEntryIndex)
      : [...parent.entries];

    const branchId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const branch: Session = {
      id: branchId,
      parentId: sessionId,
      name: branchName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      metadata: { ...parent.metadata, branchedFrom: sessionId },
      metrics: { ...parent.metrics },
      entries: entrySlice.map(e => ({ ...e })),
    };

    // Recalculate metrics for branch
    branch.metrics.entryCount = branch.entries.length;
    branch.metrics.totalTokens = branch.entries.reduce((sum, e) => sum + (e.tokens || 0), 0);
    branch.metrics.toolCalls = branch.entries.filter(e => e.type === 'tool_call').length;
    branch.metrics.checkpoints = branch.entries.filter(e => e.type === 'checkpoint').length;

    // Only freeze parent if explicitly requested
    if (freezeParent) {
      parent.status = 'branched';
    }

    this.sessions.set(branchId, branch);
    this.save();

    // Emit hook event
    if (this.hooks) {
      this.hooks.emit('session.branch', {
        parentId: sessionId,
        branchId,
        branchName,
        entryCount: branch.entries.length,
      }, 'session-manager').catch(() => {});
    }

    return branch;
  }

  search(query: string, options?: { sessionId?: string; limit?: number }): SessionSearchResult[] {
    const queryWords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
    if (queryWords.length === 0) return [];

    const limit = options?.limit || 20;
    const results: SessionSearchResult[] = [];

    const sessionsToSearch = options?.sessionId
      ? [options.sessionId]
      : [...this.sessions.keys()];

    for (const sid of sessionsToSearch) {
      const session = this.sessions.get(sid);
      if (!session) continue;

      for (const entry of session.entries) {
        const entryText = entry.content.toLowerCase();
        const matchCount = queryWords.filter(qw => entryText.includes(qw)).length;
        if (matchCount > 0) {
          const score = matchCount / queryWords.length;
          results.push({
            sessionId: sid,
            entryId: entry.id,
            content: entry.content.slice(0, 200),
            score,
            timestamp: entry.timestamp,
          });
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  compact(sessionId: string, summarizer?: (entries: SessionEntry[]) => string): CompactionResult | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.entries.length === 0) return null;

    const entriesBefore = session.entries.length;
    const tokensBefore = session.metrics.totalTokens;

    // Keep last 20% of entries, summarize older ones
    const keepCount = Math.max(Math.ceil(session.entries.length * 0.2), 1);
    const oldEntries = session.entries.slice(0, -keepCount);
    const keptEntries = session.entries.slice(-keepCount);

    if (oldEntries.length === 0) return null;

    const summary = summarizer
      ? summarizer(oldEntries)
      : this.defaultSummarize(oldEntries);

    const summaryEntry: SessionEntry = {
      id: `entry-compact-${Date.now()}`,
      timestamp: oldEntries[0]?.timestamp || new Date().toISOString(),
      type: 'note',
      content: `[Compacted ${oldEntries.length} entries] ${summary}`,
      tokens: Math.ceil(summary.length / 4),
    };

    session.entries = [summaryEntry, ...keptEntries];
    session.metrics.entryCount = session.entries.length;
    session.metrics.totalTokens = session.entries.reduce((sum, e) => sum + (e.tokens || 0), 0);
    session.updatedAt = new Date().toISOString();

    this.save();

    const result: CompactionResult = {
      sessionId,
      entriesBefore,
      entriesAfter: session.entries.length,
      tokensBefore,
      tokensAfter: session.metrics.totalTokens,
      summary,
    };

    // Emit hook event
    if (this.hooks) {
      this.hooks.emit('session.compact', {
        sessionId,
        entriesBefore,
        entriesAfter: result.entriesAfter,
        tokensSaved: tokensBefore - result.tokensAfter,
      }, 'session-manager').catch(() => {});
    }

    return result;
  }

  getMetrics(sessionId: string): SessionMetrics | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.metrics } : null;
  }

  getAggregateMetrics(): {
    totalSessions: number;
    activeSessions: number;
    totalTokens: number;
    totalEntries: number;
    avgTokensPerSession: number;
    avgEntriesPerSession: number;
  } {
    const sessions = [...this.sessions.values()];
    const totalTokens = sessions.reduce((sum, s) => sum + s.metrics.totalTokens, 0);
    const totalEntries = sessions.reduce((sum, s) => sum + s.metrics.entryCount, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      totalTokens,
      totalEntries,
      avgTokensPerSession: sessions.length > 0 ? totalTokens / sessions.length : 0,
      avgEntriesPerSession: sessions.length > 0 ? totalEntries / sessions.length : 0,
    };
  }

  updateStatus(sessionId: string, status: SessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = status;
    session.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  delete(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) this.save();
    return deleted;
  }

  clear(): void {
    this.sessions.clear();
    this.save();
  }

  private defaultSummarize(entries: SessionEntry[]): string {
    const types = new Map<string, number>();
    for (const e of entries) {
      types.set(e.type, (types.get(e.type) || 0) + 1);
    }

    const parts = [...types.entries()]
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    const totalTokens = entries.reduce((sum, e) => sum + (e.tokens || 0), 0);

    // Include content snippets from key entries
    const keyEntries = entries
      .filter(e => e.type === 'message' || e.type === 'tool_call')
      .slice(0, 3)
      .map(e => e.content.slice(0, 60));

    const snippets = keyEntries.length > 0
      ? ` Key items: ${keyEntries.join('; ')}`
      : '';

    return `${parts}. ${totalTokens} tokens total.${snippets}`;
  }

  private load(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;
    try {
      const store: SessionStore = JSON.parse(readFileSync(this.dataFile, 'utf-8'));
      for (const session of store.sessions) {
        this.sessions.set(session.id, session);
      }
    } catch { /* start fresh if corrupt */ }
  }

  private save(): void {
    if (!this.dataFile) return;
    const store: SessionStore = {
      version: '1.0.0',
      sessions: [...this.sessions.values()],
    };
    writeFileSync(this.dataFile, JSON.stringify(store, null, 2));
  }
}

export function createSessionManager(dataDir?: string): SessionManager {
  return new SessionManager(dataDir);
}
