/**
 * Cascade Monitor
 * 
 * Tracks and analyzes cascade events for the memory system.
 * Logs cascade patterns to enable learning and improvement.
 */

import type { CascadeEvent } from './dag-executor';

export interface CascadePattern {
  rootCause: string;      // The task that originally failed
  cascadeLength: number;   // Number of tasks affected
  totalFailureRate: number;
  mostCommonPolicy: string;
  tasksAffected: string[];
  lastOccurred: Date;
}

export interface CascadeReport {
  totalCascades: number;
  totalTasksAffected: number;
  avgCascadeLength: number;
  byPolicy: Record<string, number>;
  byRootCause: Record<string, CascadePattern>;
  recommendations: string[];
}

export class CascadeMonitor {
  private events: CascadeEvent[] = [];
  private patterns: Map<string, CascadePattern> = new Map();
  
  /**
   * Record a cascade event
   */
  recordEvent(event: CascadeEvent): void {
    this.events.push(event);
    this.updatePattern(event);
  }
  
  /**
   * Record multiple events
   */
  recordEvents(events: CascadeEvent[]): void {
    events.forEach(e => this.recordEvent(e));
  }
  
  /**
   * Update cascade pattern from event
   */
  private updatePattern(event: CascadeEvent): void {
    const rootId = event.failedDependencyId;
    
    if (!this.patterns.has(rootId)) {
      this.patterns.set(rootId, {
        rootCause: rootId,
        cascadeLength: 0,
        totalFailureRate: 0,
        mostCommonPolicy: event.policy,
        tasksAffected: [],
        lastOccurred: event.timestamp,
      });
    }
    
    const pattern = this.patterns.get(rootId)!;
    pattern.tasksAffected.push(event.taskId);
    pattern.cascadeLength = pattern.tasksAffected.length;
    pattern.lastOccurred = event.timestamp;
    
    // Update most common policy
    const policyCounts: Record<string, number> = {};
    this.events
      .filter(e => e.failedDependencyId === rootId)
      .forEach(e => {
        policyCounts[e.policy] = (policyCounts[e.policy] || 0) + 1;
      });
    pattern.mostCommonPolicy = Object.entries(policyCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Calculate failure rate
    const totalRelatedEvents = this.events.filter(e => e.failedDependencyId === rootId).length;
    const abortedEvents = this.events.filter(e => e.failedDependencyId === rootId && e.decision === 'abort').length;
    pattern.totalFailureRate = abortedEvents / totalRelatedEvents;
  }
  
  /**
   * Generate analysis report
   */
  generateReport(): CascadeReport {
    const byPolicy: Record<string, number> = {};
    const byRootCause: Record<string, CascadePattern> = {};
    
    let totalTasksAffected = 0;
    
    for (const event of this.events) {
      byPolicy[event.policy] = (byPolicy[event.policy] || 0) + 1;
      totalTasksAffected++;
    }
    
    for (const [rootId, pattern] of this.patterns) {
      byRootCause[rootId] = pattern;
    }
    
    const avgCascadeLength = this.patterns.size > 0
      ? totalTasksAffected / this.patterns.size
      : 0;
    
    return {
      totalCascades: this.patterns.size,
      totalTasksAffected,
      avgCascadeLength,
      byPolicy,
      byRootCause,
      recommendations: this.generateRecommendations(byRootCause, byPolicy),
    };
  }
  
  /**
   * Generate recommendations based on patterns
   */
  private generateRecommendations(
    byRootCause: Record<string, CascadePattern>,
    byPolicy: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];
    
    // High cascade length patterns
    const highCascadePatterns = Object.values(byRootCause)
      .filter(p => p.cascadeLength > 3);
    
    if (highCascadePatterns.length > 0) {
      recommendations.push(
        `⚠️ ${highCascadePatterns.length} task(s) cause long cascades (>3 tasks). ` +
        `Consider adding circuit breakers or timeout policies.`
      );
    }
    
    // High abort rate
    const highAbortPatterns = Object.values(byRootCause)
      .filter(p => p.totalFailureRate > 0.8);
    
    if (highAbortPatterns.length > 0) {
      recommendations.push(
        `⚠️ ${highAbortPatterns.length} dependency failure(s) consistently cause aborts. ` +
        `Review if 'degrade' policy would be appropriate.`
      );
    }
    
    // Most common policies
    const mostCommon = Object.entries(byPolicy)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (mostCommon[0] === 'abort') {
      recommendations.push(
        `💡 Most cascade events use 'abort' policy. ` +
        `Consider whether 'degrade' or 'retry' would preserve more work.`
      );
    }
    
    return recommendations;
  }
  
  /**
   * Export events for memory system
   */
  exportForMemory(): {
    timestamp: Date;
    type: string;
    data: Record<string, unknown>;
    tags: string[];
  }[] {
    return this.events.map(event => ({
      timestamp: event.timestamp,
      type: 'cascade_event',
      data: {
        taskId: event.taskId,
        failedDependencyId: event.failedDependencyId,
        policy: event.policy,
        decision: event.decision,
        reason: event.reason,
      },
      tags: ['cascade', 'failure', event.policy, event.decision],
    }));
  }
  
  /**
   * Get recent events
   */
  getRecentEvents(limit = 10): CascadeEvent[] {
    return this.events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.patterns.clear();
  }
}

export default CascadeMonitor;
