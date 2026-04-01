/**
 * Persona Analytics
 *
 * Usage metrics and effectiveness tracking for personas.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface PersonaMetrics {
  slug: string;
  totalSessions: number;
  totalDuration: number; // ms
  avgSessionDuration: number; // ms
  lastActive: string;
  firstActive: string;
  taskCompletionRate: number; // 0-1
  errorRate: number; // 0-1
  switchAwayRate: number; // how often users switch away quickly
  toolUsage: Record<string, number>;
  domainBreakdown: Record<string, number>;
}

export interface SessionEvent {
  type: 'session_start' | 'session_end' | 'task_complete' | 'task_fail' | 'tool_call' | 'switch_away' | 'error';
  persona: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface StoredAnalytics {
  version: string;
  personas: Record<string, PersonaRawMetrics>;
  events: SessionEvent[];
}

interface PersonaRawMetrics {
  sessions: number;
  totalDuration: number;
  tasksCompleted: number;
  tasksFailed: number;
  errors: number;
  switchAways: number;
  toolCalls: Record<string, number>;
  domains: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  sessionStarts: string[];
}

export class PersonaAnalytics {
  private dataFile: string;
  private data: StoredAnalytics;
  private activeSessions: Map<string, string> = new Map(); // persona -> start timestamp
  private eventBuffer: SessionEvent[] = [];
  private flushInterval: number = 30000; // 30s
  private maxEvents: number = 10000;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.dataFile = join(dataDir, 'persona-analytics.json');
    this.data = this.load();
  }

  recordEvent(event: SessionEvent): void {
    this.eventBuffer.push(event);
    this.processEvent(event);

    if (this.eventBuffer.length >= 50) {
      this.flush();
    }
  }

  startSession(persona: string): void {
    const now = new Date().toISOString();
    this.activeSessions.set(persona, now);
    this.recordEvent({
      type: 'session_start',
      persona,
      timestamp: now,
    });
  }

  endSession(persona: string): void {
    const startTime = this.activeSessions.get(persona);
    const now = new Date().toISOString();

    if (startTime) {
      const duration = new Date(now).getTime() - new Date(startTime).getTime();
      const raw = this.ensurePersona(persona);
      raw.totalDuration += duration;
      this.activeSessions.delete(persona);
    }

    this.recordEvent({
      type: 'session_end',
      persona,
      timestamp: now,
    });
  }

  recordTaskComplete(persona: string, metadata?: Record<string, unknown>): void {
    this.recordEvent({
      type: 'task_complete',
      persona,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  recordTaskFail(persona: string, metadata?: Record<string, unknown>): void {
    this.recordEvent({
      type: 'task_fail',
      persona,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  recordToolCall(persona: string, toolName: string): void {
    this.recordEvent({
      type: 'tool_call',
      persona,
      timestamp: new Date().toISOString(),
      metadata: { tool: toolName },
    });
  }

  recordError(persona: string, error: string): void {
    this.recordEvent({
      type: 'error',
      persona,
      timestamp: new Date().toISOString(),
      metadata: { error },
    });
  }

  recordSwitchAway(persona: string): void {
    this.recordEvent({
      type: 'switch_away',
      persona,
      timestamp: new Date().toISOString(),
    });
  }

  getMetrics(persona: string): PersonaMetrics | null {
    this.flush();
    const raw = this.data.personas[persona];
    if (!raw) return null;

    const totalTasks = raw.tasksCompleted + raw.tasksFailed;

    return {
      slug: persona,
      totalSessions: raw.sessions,
      totalDuration: raw.totalDuration,
      avgSessionDuration: raw.sessions > 0 ? raw.totalDuration / raw.sessions : 0,
      lastActive: raw.lastSeen,
      firstActive: raw.firstSeen,
      taskCompletionRate: totalTasks > 0 ? raw.tasksCompleted / totalTasks : 0,
      errorRate: raw.sessions > 0 ? raw.errors / raw.sessions : 0,
      switchAwayRate: raw.sessions > 0 ? raw.switchAways / raw.sessions : 0,
      toolUsage: { ...raw.toolCalls },
      domainBreakdown: { ...raw.domains },
    };
  }

  getAllMetrics(): PersonaMetrics[] {
    this.flush();
    return Object.keys(this.data.personas).map(slug => this.getMetrics(slug)!);
  }

  getTopPersonas(limit = 5): PersonaMetrics[] {
    return this.getAllMetrics()
      .sort((a, b) => b.totalSessions - a.totalSessions)
      .slice(0, limit);
  }

  getEffectivenessReport(): Record<string, { completionRate: number; errorRate: number; avgDuration: number }> {
    const metrics = this.getAllMetrics();
    const report: Record<string, { completionRate: number; errorRate: number; avgDuration: number }> = {};

    for (const m of metrics) {
      report[m.slug] = {
        completionRate: m.taskCompletionRate,
        errorRate: m.errorRate,
        avgDuration: m.avgSessionDuration,
      };
    }

    return report;
  }

  getRecentEvents(limit = 50): SessionEvent[] {
    this.flush();
    return this.data.events.slice(-limit);
  }

  getEventsForPersona(persona: string, limit = 50): SessionEvent[] {
    this.flush();
    return this.data.events
      .filter(e => e.persona === persona)
      .slice(-limit);
  }

  resetMetrics(persona?: string): void {
    if (persona) {
      delete this.data.personas[persona];
      this.data.events = this.data.events.filter(e => e.persona !== persona);
    } else {
      this.data.personas = {};
      this.data.events = [];
    }
    this.save();
  }

  flush(): void {
    // Merge buffered events
    this.data.events.push(...this.eventBuffer);
    this.eventBuffer = [];

    // Trim events to max
    if (this.data.events.length > this.maxEvents) {
      this.data.events = this.data.events.slice(-this.maxEvents);
    }

    this.save();
  }

  private processEvent(event: SessionEvent): void {
    const raw = this.ensurePersona(event.persona);
    raw.lastSeen = event.timestamp;

    switch (event.type) {
      case 'session_start':
        raw.sessions++;
        raw.sessionStarts.push(event.timestamp);
        if (raw.sessionStarts.length > 100) {
          raw.sessionStarts = raw.sessionStarts.slice(-100);
        }
        break;
      case 'task_complete':
        raw.tasksCompleted++;
        if (event.metadata?.domain) {
          const domain = String(event.metadata.domain);
          raw.domains[domain] = (raw.domains[domain] || 0) + 1;
        }
        break;
      case 'task_fail':
        raw.tasksFailed++;
        break;
      case 'tool_call':
        if (event.metadata?.tool) {
          const tool = String(event.metadata.tool);
          raw.toolCalls[tool] = (raw.toolCalls[tool] || 0) + 1;
        }
        break;
      case 'error':
        raw.errors++;
        break;
      case 'switch_away':
        raw.switchAways++;
        break;
    }
  }

  private ensurePersona(slug: string): PersonaRawMetrics {
    if (!this.data.personas[slug]) {
      this.data.personas[slug] = {
        sessions: 0,
        totalDuration: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        errors: 0,
        switchAways: 0,
        toolCalls: {},
        domains: {},
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        sessionStarts: [],
      };
    }
    return this.data.personas[slug];
  }

  private load(): StoredAnalytics {
    if (existsSync(this.dataFile)) {
      try {
        const content = readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(content) as StoredAnalytics;
      } catch {
        // Corrupted, start fresh
      }
    }
    return { version: '1.0.0', personas: {}, events: [] };
  }

  private save(): void {
    writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
  }
}

export function createAnalytics(dataDir: string): PersonaAnalytics {
  return new PersonaAnalytics(dataDir);
}
