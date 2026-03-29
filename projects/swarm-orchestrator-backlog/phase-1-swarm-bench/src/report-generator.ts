/**
 * SWARM-bench: HTML Report Generator
 * 
 * Generates visual benchmark reports with charts and trend analysis.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { BenchmarkResult, ExecutorStats, InstanceTrend } from './result-store.js';

export interface ReportData {
  title: string;
  generatedAt: string;
  summary: {
    totalRuns: number;
    passRate: number;
    avgScore: number;
    totalDuration: number;
  };
  results: BenchmarkResult[];
  executorStats: ExecutorStats[];
  trends: InstanceTrend[];
  recentFailures: BenchmarkResult[];
}

export class ReportGenerator {
  private template: string;
  
  constructor() {
    this.template = this.loadTemplate();
  }
  
  private loadTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { color: #f8fafc; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; border: 1px solid #334155; }
    .card h3 { color: #94a3b8; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .value { font-size: 2rem; font-weight: 700; }
    .card .value.pass { color: #22c55e; }
    .card .value.fail { color: #ef4444; }
    .card .value.score { color: #3b82f6; }
    .card .value.time { color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
    th, td { text-align: left; padding: 1rem; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
    tr:hover { background: #1e293b; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge.pass { background: #22c55e20; color: #22c55e; }
    .badge.fail { background: #ef444420; color: #ef4444; }
    .badge.grade-a { background: #22c55e20; color: #22c55e; }
    .badge.grade-b { background: #3b82f620; color: #3b82f6; }
    .badge.grade-c { background: #f59e0b20; color: #f59e0b; }
    .badge.grade-d { background: #f9731620; color: #f97316; }
    .badge.grade-f { background: #ef444420; color: #ef4444; }
    .trend { display: flex; align-items: center; gap: 0.5rem; }
    .trend.up { color: #22c55e; }
    .trend.down { color: #ef4444; }
    .trend.stable { color: #94a3b8; }
    .section { margin-bottom: 3rem; }
    .section h2 { color: #f8fafc; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #334155; }
    .progress-bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-top: 0.5rem; }
    .progress-bar .fill { height: 100%; background: #3b82f6; border-radius: 4px; }
    .progress-bar .fill.pass { background: #22c55e; }
    .progress-bar .fill.fail { background: #ef4444; }
    @media print { body { background: white; color: black; } .card { border: 1px solid #ddd; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{title}}</h1>
    <p class="subtitle">Generated: {{generatedAt}}</p>
    
    <div class="grid">
      <div class="card">
        <h3>Total Runs</h3>
        <div class="value">{{totalRuns}}</div>
      </div>
      <div class="card">
        <h3>Pass Rate</h3>
        <div class="value {{passRateClass}}">{{passRate}}%</div>
        <div class="progress-bar"><div class="fill {{passRateClass}}" style="width: {{passRate}}%"></div></div>
      </div>
      <div class="card">
        <h3>Avg Score</h3>
        <div class="value score">{{avgScore}}</div>
      </div>
      <div class="card">
        <h3>Total Duration</h3>
        <div class="value time">{{totalDuration}}</div>
      </div>
    </div>
    
    <div class="section">
      <h2>Executor Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Executor</th>
            <th>Total Runs</th>
            <th>Pass Rate</th>
            <th>Avg Score</th>
            <th>Avg Duration</th>
            <th>Last Run</th>
          </tr>
        </thead>
        <tbody>
          {{executorRows}}
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <h2>Recent Results</h2>
      <table>
        <thead>
          <tr>
            <th>Instance</th>
            <th>Executor</th>
            <th>Version</th>
            <th>Score</th>
            <th>Grade</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {{resultRows}}
        </tbody>
      </table>
    </div>
    
    {{#if recentFailures.length}}
    <div class="section">
      <h2>Recent Failures</h2>
      <table>
        <thead>
          <tr>
            <th>Instance</th>
            <th>Executor</th>
            <th>Score</th>
            <th>Error</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {{failureRows}}
        </tbody>
      </table>
    </div>
    {{/if}}
    
    <div class="section">
      <h2>Trend Analysis</h2>
      <table>
        <thead>
          <tr>
            <th>Instance</th>
            <th>Runs</th>
            <th>Latest Score</th>
            <th>Delta</th>
            <th>Pass Rate</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {{trendRows}}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
  }
  
  /**
   * Generate HTML report
   */
  generate(data: ReportData): string {
    const passRateClass = data.summary.passRate >= 80 ? 'pass' : data.summary.passRate >= 50 ? '' : 'fail';
    
    let html = this.template
      .replace('{{title}}', data.title)
      .replace('{{generatedAt}}', data.generatedAt)
      .replace('{{totalRuns}}', data.summary.totalRuns.toString())
      .replace('{{passRate}}', (data.summary.passRate * 100).toFixed(1))
      .replace('{{passRateClass}}', passRateClass)
      .replace('{{avgScore}}', (data.summary.avgScore * 100).toFixed(1) + '%')
      .replace('{{totalDuration}}', this.formatDuration(data.summary.totalDuration));
    
    // Executor leaderboard
    const executorRows = data.executorStats.map((stat, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td>${stat.executorId}</td>
        <td>${stat.totalRuns}</td>
        <td>${((stat.passCount / stat.totalRuns) * 100).toFixed(1)}%</td>
        <td>${(stat.avgScore * 100).toFixed(1)}%</td>
        <td>${this.formatDuration(stat.avgDurationMs)}</td>
        <td>${this.formatDate(stat.lastRun)}</td>
      </tr>
    `).join('');
    html = html.replace('{{executorRows}}', executorRows);
    
    // Recent results
    const resultRows = data.results.map(r => `
      <tr>
        <td>${r.instanceId}</td>
        <td>${r.executorId}</td>
        <td>${r.swarmVersion}</td>
        <td>${(r.overallScore * 100).toFixed(1)}%</td>
        <td><span class="badge grade-${r.grade.toLowerCase()}">${r.grade}</span></td>
        <td>${this.formatDuration(r.durationMs)}</td>
        <td><span class="badge ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</span></td>
        <td>${this.formatDate(r.createdAt)}</td>
      </tr>
    `).join('');
    html = html.replace('{{resultRows}}', resultRows);
    
    // Recent failures
    const failureRows = data.recentFailures.map(r => `
      <tr>
        <td>${r.instanceId}</td>
        <td>${r.executorId}</td>
        <td>${(r.overallScore * 100).toFixed(1)}%</td>
        <td>${r.errorMessage || 'Failed criteria'}</td>
        <td>${this.formatDate(r.createdAt)}</td>
      </tr>
    `).join('');
    html = html.replace('{{failureRows}}', failureRows);
    
    // Trend analysis
    const trendRows = data.trends.map(t => `
      <tr>
        <td>${t.instanceId}</td>
        <td>${t.runCount}</td>
        <td>${(t.latestScore * 100).toFixed(1)}%</td>
        <td>${t.scoreDelta >= 0 ? '+' : ''}${(t.scoreDelta * 100).toFixed(1)}%</td>
        <td>${(t.passRate * 100).toFixed(1)}%</td>
        <td>
          <span class="trend ${t.trend}">
            ${t.trend === 'improving' ? '↑' : t.trend === 'degrading' ? '↓' : '→'}
            ${t.trend.charAt(0).toUpperCase() + t.trend.slice(1)}
          </span>
        </td>
      </tr>
    `).join('');
    html = html.replace('{{trendRows}}', trendRows);
    
    return html;
  }
  
  /**
   * Save report to file
   */
  save(data: ReportData, outputPath: string): void {
    const html = this.generate(data);
    writeFileSync(outputPath, html, 'utf-8');
    console.log(`Report saved to: ${outputPath}`);
  }
  
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
  
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

export default ReportGenerator;
