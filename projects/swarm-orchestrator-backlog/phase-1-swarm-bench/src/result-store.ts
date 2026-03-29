/**
 * SWARM-bench: Result Persistence Layer
 * 
 * Stores benchmark results in JSON files for historical analysis.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface BenchmarkResult {
  id?: number;
  instanceId: string;
  executorId: string;
  swarmVersion: string;
  passed: boolean;
  overallScore: number;
  grade: string;
  durationMs: number;
  criteriaResults: StoredCriterionResult[];
  errorMessage?: string;
  createdAt: string;
}

interface StoredCriterionResult {
  criterionId: string;
  passed: boolean;
  score: number;
  details: string;
}

export interface ExecutorStats {
  executorId: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
  avgScore: number;
  avgDurationMs: number;
  lastRun: string;
}

export interface InstanceTrend {
  instanceId: string;
  runCount: number;
  latestScore: number;
  scoreDelta: number;
  passRate: number;
  trend: 'improving' | 'stable' | 'degrading';
}

interface StoredResult extends BenchmarkResult {
  id: number;
}

interface StoreData {
  nextId: number;
  results: StoredResult[];
}

export class ResultStore {
  private dbPath: string;
  private data: StoreData;
  
  constructor(options?: { dbPath?: string }) {
    this.dbPath = options?.dbPath ?? join(process.cwd(), 'data', 'results.json');
    
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    if (existsSync(this.dbPath)) {
      const content = readFileSync(this.dbPath, 'utf-8');
      this.data = JSON.parse(content);
    } else {
      this.data = { nextId: 1, results: [] };
    }
  }
  
  save(result: Omit<BenchmarkResult, 'id'>): number {
    const id = this.data.nextId++;
    const createdAt = result.createdAt ?? new Date().toISOString();
    const newResult: StoredResult = {
      ...result,
      id,
      createdAt,
    };
    this.data.results.push(newResult);
    this.persist();
    return id;
  }
  
  private persist(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
  
  getByInstance(instanceId: string, limit = 100): BenchmarkResult[] {
    return this.data.results
      .filter(r => r.instanceId === instanceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  
  getByExecutor(executorId: string, limit = 100): BenchmarkResult[] {
    return this.data.results
      .filter(r => r.executorId === executorId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  
  getExecutorStats(): ExecutorStats[] {
    const grouped = this.data.results.reduce((acc, r) => {
      const key = r.executorId;
      if (!acc[key]) {
        acc[key] = { runs: 0, passed: 0, totalScore: 0, totalDuration: 0, lastRun: r.createdAt };
      }
      acc[key].runs++;
      acc[key].passed += r.passed ? 1 : 0;
      acc[key].totalScore += r.overallScore;
      acc[key].totalDuration += r.durationMs;
      if (new Date(r.createdAt) > new Date(acc[key].lastRun)) {
        acc[key].lastRun = r.createdAt;
      }
      return acc;
    }, {} as Record<string, { runs: number; passed: number; totalScore: number; totalDuration: number; lastRun: string }>);
    
    return Object.entries(grouped).map(([executorId, stats]) => ({
      executorId,
      totalRuns: stats.runs,
      passCount: stats.passed,
      failCount: stats.runs - stats.passed,
      avgScore: stats.totalScore / stats.runs,
      avgDurationMs: stats.totalDuration / stats.runs,
      lastRun: stats.lastRun,
    }));
  }
  
  getInstanceTrend(instanceId: string, window = 10): InstanceTrend | null {
    const results = this.data.results
      .filter(r => r.instanceId === instanceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, window);
    
    if (results.length === 0) return null;
    
    const scores = results.map(r => r.overallScore);
    const latestScore = scores[0];
    const oldestScore = scores[scores.length - 1];
    const scoreDelta = latestScore - oldestScore;
    const passCount = results.filter(r => r.passed).length;
    
    let trend: 'improving' | 'stable' | 'degrading';
    if (scoreDelta > 0.05) trend = 'improving';
    else if (scoreDelta < -0.05) trend = 'degrading';
    else trend = 'stable';
    
    return {
      instanceId,
      runCount: results.length,
      latestScore,
      scoreDelta,
      passRate: passCount / results.length,
      trend,
    };
  }
  
  getLeaderboard(limit = 10): ExecutorStats[] {
    return this.getExecutorStats()
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, limit);
  }
  
  getRecentResults(hours = 24, limit = 50): BenchmarkResult[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.data.results
      .filter(r => new Date(r.createdAt) >= cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  
  export(): BenchmarkResult[] {
    return [...this.data.results];
  }
}

export default ResultStore;
