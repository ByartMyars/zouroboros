/**
 * SWARM-bench: Swarm Orchestrator Quality Evaluation Harness
 * 
 * A benchmark harness for evaluating swarm orchestrator task quality.
 * Inspired by SWE-bench but adapted for multi-agent orchestration.
 * 
 * Usage:
 *   bun swarm-bench.ts run --instance <id>           Run single benchmark
 *   bun swarm-bench.ts run --category code-review    Run all in category
 *   bun swarm-bench.ts run --all                     Run all benchmarks
 *   bun swarm-bench.ts report --format html          Generate report
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { WorkspaceIsolation } from './workspace-isolation';
import type { BenchmarkInstance, BenchmarkResult, CriterionResult, BenchmarkReport } from '../benchmarks/benchmark-schema';

// Configuration
const CONFIG = {
  benchmarksDir: join(__dirname, '../benchmarks'),
  resultsDir: join(__dirname, '../results'),
  executors: ['claude-code', 'hermes', 'gemini', 'codex'],
  defaultTimeout: 300, // 5 minutes
};

export class SWARMBench {
  private isolation: WorkspaceIsolation;
  private results: Map<string, BenchmarkResult> = new Map();
  
  constructor() {
    this.isolation = new WorkspaceIsolation();
  }
  
  /**
   * Load a benchmark instance by ID
   */
  loadInstance(instanceId: string): BenchmarkInstance {
    const files = readdirSync(CONFIG.benchmarksDir);
    // First try exact match
    let instanceFile = files.find(f => f === `${instanceId}.json`);
    
    // Then try partial match
    if (!instanceFile) {
      instanceFile = files.find(f => f.startsWith(instanceId) && f.endsWith('.json'));
    }
    
    if (!instanceFile) {
      throw new Error(`Benchmark instance ${instanceId} not found`);
    }
    
    const content = readFileSync(join(CONFIG.benchmarksDir, instanceFile), 'utf-8');
    const instance = JSON.parse(content) as BenchmarkInstance;
    
    return instance;
  }
  
  /**
   * Load all benchmark instances
   */
  loadAllInstances(): BenchmarkInstance[] {
    const files = readdirSync(CONFIG.benchmarksDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const content = readFileSync(join(CONFIG.benchmarksDir, f), 'utf-8');
      return JSON.parse(content) as BenchmarkInstance;
    });
  }
  
  /**
   * Run a single benchmark instance with a specific executor
   */
  async runInstance(
    instance: BenchmarkInstance,
    executorId: string
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const workspaceId = `bench-${instance.id}-${executorId}`;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${instance.id} with ${executorId}`);
    console.log(`Category: ${instance.category} | Difficulty: ${instance.difficulty}`);
    console.log(`${'='.repeat(60)}`);
    
    let workspace;
    let taskOutput = '';
    const errors: string[] = [];
    const criterionResults: CriterionResult[] = [];
    
    try {
      // Create isolated workspace
      workspace = await this.isolation.createWorkspace(instance.id);
      
      // Setup workspace with initial files
      if (instance.workspaceSetup) {
        await this.isolation.setupWorkspace(workspace.id, {
          files: instance.workspaceSetup.files,
          directories: instance.workspaceSetup.directories,
          gitHistory: instance.workspaceSetup.gitHistory,
          env: instance.workspaceSetup.env,
        });
      }
      
      // Execute the benchmark task
      console.log(`Executing task...`);
      const result = await this.isolation.executeBenchmark(
        workspace.id,
        instance.task.prompt,
        {
          executor: executorId,
          timeout: instance.metadata.avgDurationSeconds 
            ? Math.ceil(instance.metadata.avgDurationSeconds * 1.5) 
            : CONFIG.defaultTimeout,
          memory: false, // Benchmark with clean state
        }
      );
      
      taskOutput = result.stdout + '\n' + result.stderr;
      
      if (result.exitCode !== 0) {
        errors.push(`Task exited with code ${result.exitCode}`);
      }
      
      // Get workspace state
      const state = this.isolation.getWorkspaceState(workspace.id);
      taskOutput += '\n\n--- Workspace State ---\n';
      taskOutput += state.gitStatus;
      
      // Evaluate acceptance criteria
      console.log(`\nEvaluating ${instance.acceptanceCriteria.length} acceptance criteria...`);
      
      for (const criterion of instance.acceptanceCriteria) {
        const criterionResult = await this.evaluateCriterion(
          criterion,
          taskOutput,
          state.diff,
          workspace.id
        );
        criterionResults.push(criterionResult);
        
        const status = criterionResult.passed ? '✅' : '❌';
        console.log(`  ${status} ${criterion.id}: ${criterion.description}`);
        if (criterionResult.details) {
          console.log(`      ${criterionResult.details}`);
        }
      }
      
      // Calculate score
      const passedCount = criterionResults.filter(r => r.passed).length;
      const score = passedCount / criterionResults.length;
      
      const benchmarkResult: BenchmarkResult = {
        instanceId: instance.id,
        executor: executorId,
        executorId,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        criterionResults,
        passed: passedCount === criterionResults.length,
        score,
        taskOutput,
        errors: errors.length > 0 ? errors : undefined,
      };
      
      // Save result
      this.saveResult(benchmarkResult);
      this.results.set(`${instance.id}:${executorId}`, benchmarkResult);
      
      // Summary
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Result: ${benchmarkResult.passed ? 'PASS' : 'FAIL'} (${(score * 100).toFixed(0)}% scored)`);
      console.log(`Duration: ${(benchmarkResult.durationMs / 1000).toFixed(1)}s`);
      console.log(`${'─'.repeat(60)}`);
      
      return benchmarkResult;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      console.error(`Error: ${errorMessage}`);
      
      const benchmarkResult: BenchmarkResult = {
        instanceId: instance.id,
        executor: executorId,
        executorId,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        criterionResults,
        passed: false,
        score: 0,
        taskOutput,
        errors,
      };
      
      this.saveResult(benchmarkResult);
      return benchmarkResult;
      
    } finally {
      // Cleanup workspace
      if (workspace && CONFIG.resultsDir) {
        try {
          // Workspace cleanup handled by isolation class
        } catch (e) {
          console.warn(`Failed to cleanup workspace: ${e}`);
        }
      }
    }
  }
  
  /**
   * Evaluate a single acceptance criterion
   */
  private async evaluateCriterion(
    criterion: BenchmarkInstance['acceptanceCriteria'][0],
    taskOutput: string,
    diff: string,
    workspaceId: string
  ): Promise<CriterionResult> {
    const result: CriterionResult = {
      criterionId: criterion.id,
      description: criterion.description,
      passed: false,
    };
    
    try {
      switch (criterion.type) {
        case 'content-contains':
          result.passed = taskOutput.toLowerCase().includes(
            (criterion.config.expected || '').toLowerCase()
          );
          result.details = result.passed ? 'Found expected content' : 'Expected content not found';
          break;
          
        case 'content-regex':
          const regex = new RegExp(criterion.config.pattern || '', 'i');
          result.passed = regex.test(taskOutput) || regex.test(diff);
          result.details = result.passed ? 'Pattern matched' : 'Pattern not found';
          break;
          
        case 'file-exists':
          const workspace = this.isolation.listWorkspaces().find(w => w.id === workspaceId);
          if (workspace && criterion.config.filePath) {
            const filePath = join(workspace.path, criterion.config.filePath);
            result.passed = existsSync(filePath);
            result.details = result.passed ? 'File exists' : 'File not found';
          }
          break;
          
        case 'no-error-pattern':
          const errorRegex = new RegExp(criterion.config.pattern || '', 'i');
          result.passed = !errorRegex.test(taskOutput);
          result.details = result.passed ? 'No error pattern found' : 'Error pattern detected';
          break;
          
        case 'output-contains':
          const outputExpected = criterion.config.expected || '';
          result.passed = taskOutput.toLowerCase().includes(outputExpected.toLowerCase());
          result.details = result.passed
            ? 'Output contains expected text'
            : `Output does not contain "${outputExpected}"`;
          break;
          
        case 'all-of':
        case 'any-of':
          // Composite criteria evaluation
          const subResults = await Promise.all(
            (criterion.config.criteria ?? []).map(c =>
              this.evaluateCriterion(c, taskOutput, diff, workspaceId)
            )
          );
          
          result.passed = criterion.type === 'all-of'
            ? subResults.every(r => r.passed)
            : subResults.some(r => r.passed);
          break;
          
        default:
          result.details = `Criterion type ${criterion.type} not yet implemented`;
      }
    } catch (error) {
      result.details = `Evaluation error: ${error}`;
    }
    
    return result;
  }
  
  /**
   * Save result to file
   */
  private saveResult(result: BenchmarkResult): void {
    const resultsPath = join(CONFIG.resultsDir, `${result.instanceId}-${result.executorId}.json`);
    
    // Ensure results directory exists
    if (!existsSync(CONFIG.resultsDir)) {
      require('fs').mkdirSync(CONFIG.resultsDir, { recursive: true });
    }
    
    writeFileSync(resultsPath, JSON.stringify(result, null, 2));
    console.log(`Result saved to: ${resultsPath}`);
  }
  
  /**
   * Generate benchmark report
   */
  generateReport(): BenchmarkReport {
    const results = Array.from(this.results.values());
    
    const summary = {
      totalInstances: new Set(results.map(r => r.instanceId)).size,
      totalExecutors: new Set(results.map(r => r.executorId)).size,
      overallPassRate: results.filter(r => r.passed).length / results.length,
      avgDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
    };
    
    // Group by category
    const byCategory: Record<string, { passRate: number; count: number }> = {};
    const instances = this.loadAllInstances();
    
    for (const instance of instances) {
      const catResults = results.filter(r => r.instanceId === instance.id);
      if (catResults.length > 0) {
        const passed = catResults.filter(r => r.passed).length;
        byCategory[instance.category] = {
          passRate: passed / catResults.length,
          count: catResults.length,
        };
      }
    }
    
    // Group by executor
    const byExecutor: Record<string, BenchmarkResult[]> = {};
    for (const result of results) {
      if (!byExecutor[result.executorId]) {
        byExecutor[result.executorId] = [];
      }
      byExecutor[result.executorId].push(result);
    }
    
    const report: BenchmarkReport = {
      generatedAt: new Date().toISOString(),
      benchmarkVersion: '1.0.0',
      orchestratorVersion: '5.0.0',
      summary,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, {
          passRate: v.passRate,
          avgDurationMs: 0,
          executorRankings: [],
        }])
      ),
      byExecutor: Object.fromEntries(
        Object.entries(byExecutor).map(([k, v]) => [k, {
          totalPassed: v.filter(r => r.passed).length,
          totalFailed: v.filter(r => !r.passed).length,
          passRate: v.filter(r => r.passed).length / v.length,
          avgDurationMs: v.reduce((sum, r) => sum + r.durationMs, 0) / v.length,
          avgScore: v.reduce((sum, r) => sum + r.score, 0) / v.length,
          categories: {},
        }])
      ),
      byDifficulty: {},
      instances: results,
    };
    
    return report;
  }
}

// CLI interface
const bench = new SWARMBench();
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'run':
    if (arg === '--all') {
      // Run all instances with all executors
      const instances = bench.loadAllInstances();
      for (const instance of instances) {
        for (const executor of CONFIG.executors) {
          await bench.runInstance(instance, executor);
        }
      }
      console.log('\n' + '='.repeat(60));
      console.log('All benchmarks complete');
      console.log(JSON.stringify(bench.generateReport(), null, 2));
    } else if (arg === '--instance') {
      const instanceId = process.argv[4];
      if (!instanceId) {
        console.error('Usage: run --instance <instance-id>');
        process.exit(1);
      }
      const instance = bench.loadInstance(instanceId);
      for (const executor of CONFIG.executors) {
        await bench.runInstance(instance, executor);
      }
    } else if (arg === '--category') {
      const category = process.argv[4];
      const instances = bench.loadAllInstances().filter(i => i.category === category);
      console.log(`Running ${instances.length} instances in category: ${category}`);
      for (const instance of instances) {
        for (const executor of CONFIG.executors) {
          await bench.runInstance(instance, executor);
        }
      }
    }
    break;
    
  case 'report':
    console.log(JSON.stringify(bench.generateReport(), null, 2));
    break;
    
  case 'list':
    const instances = bench.loadAllInstances();
    console.log(`\nAvailable benchmark instances (${instances.length}):\n`);
    for (const instance of instances) {
      console.log(`  ${instance.id}`);
      console.log(`    Category: ${instance.category} | Difficulty: ${instance.difficulty}`);
      console.log(`    ACs: ${instance.acceptanceCriteria.length} | Avg time: ${instance.metadata.avgDurationSeconds}s`);
      console.log();
    }
    break;
    
  default:
    console.log(`
SWARM-bench: Swarm Orchestrator Quality Evaluation Harness

Usage:
  bun swarm-bench.ts list                    List all benchmark instances
  bun swarm-bench.ts run --all               Run all benchmarks
  bun swarm-bench.ts run --instance <id>     Run specific instance
  bun swarm-bench.ts run --category <cat>   Run all in category
  bun swarm-bench.ts report                  Generate benchmark report
    `);
}
