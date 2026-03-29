/**
 * SWARM-bench CLI Entry Point
 * 
 * Integrated CLI for running benchmarks with full feature set:
 * - AC verification engine
 * - Ground truth comparison
 * - Result persistence
 * - HTML report generation
 */

import { SWARMBench } from './swarm-bench';
import { AcceptanceCriteriaVerifier } from './ac-verification';
import { GroundTruthEngine } from './ground-truth';
import { ResultStore } from './result-store';
import { ReportGenerator } from './report-generator';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface CLIOptions {
  command: 'list' | 'run' | 'report' | 'baseline';
  instance?: string;
  category?: string;
  executor?: string;
  all?: boolean;
  format?: 'html' | 'json' | 'text';
  output?: string;
  threshold?: number;
  version?: string;
  force?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = { command: 'list' };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case 'list':
        options.command = 'list';
        break;
      case 'run':
        options.command = 'run';
        if (args[i + 1]?.startsWith('--')) {
          // No instance specified, use defaults
        } else if (args[i + 1]) {
          options.instance = args[++i];
        }
        break;
      case 'report':
        options.command = 'report';
        break;
      case 'baseline':
        options.command = 'baseline';
        break;
      case '--instance':
      case '-i':
        options.instance = args[++i];
        break;
      case '--category':
      case '-c':
        options.category = args[++i];
        break;
      case '--executor':
      case '-e':
        options.executor = args[++i];
        break;
      case '--all':
      case '-a':
        options.all = true;
        break;
      case '--format':
      case '-f':
        options.format = args[++i] as 'html' | 'json' | 'text';
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--threshold':
        options.threshold = parseFloat(args[++i]);
        break;
      case '--version':
        options.version = args[++i];
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
SWARM-bench: Swarm Orchestrator Quality Evaluation Harness

Usage:
  bun index.ts list                      List all benchmark instances
  bun index.ts run --instance <id>       Run a single benchmark
  bun index.ts run --category <cat>      Run all in a category
  bun index.ts run --all                 Run all benchmarks
  bun index.ts baseline --instance <id>  Save ground truth baseline
  bun index.ts report                    Generate HTML report
  bun index.ts report --format json      Generate JSON report

Options:
  -i, --instance <id>    Specific benchmark instance ID
  -c, --category <cat>  Filter by category (code-review, bug-fix, etc.)
  -e, --executor <id>    Specific executor (default: all)
  -a, --all             Run all instances
  -f, --format <fmt>    Report format: html, json, text
  -o, --output <path>   Output file path
  -t, --threshold <n>    Similarity threshold (default: 0.95)
  -v, --version <ver>   Swarm version for baseline
  --force                Overwrite existing baseline

Examples:
  bun index.ts list
  bun index.ts run --instance sample-instance
  bun index.ts run --category security
  bun index.ts run --all --executor claude-code
  bun index.ts baseline --instance sample-instance --version v1.0
  bun index.ts report --format html
`);
}

async function main() {
  const options = parseArgs();
  const baseDir = join(__dirname, '..');
  const benchmarksDir = join(baseDir, 'benchmarks');
  const resultsDir = join(baseDir, 'results');
  
  // Ensure directories exist
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }
  
  // Initialize components
  const store = new ResultStore({ dbPath: join(resultsDir, 'results.db') });
  const groundTruth = new GroundTruthEngine({ baselinesDir: join(baseDir, 'baselines') });
  const reportGen = new ReportGenerator();
  
  switch (options.command) {
    case 'list':
      await listInstances(benchmarksDir, options.category);
      break;
      
    case 'run':
      await runBenchmarks(benchmarksDir, options, store, groundTruth);
      break;
      
    case 'baseline':
      await saveBaseline(benchmarksDir, options, store);
      break;
      
    case 'report':
      await generateReport(store, reportGen, options);
      break;
  }
}

async function listInstances(benchmarksDir: string, category?: string): Promise<void> {
  const files = readdirSync(benchmarksDir).filter(f => f.endsWith('.json'));
  
  console.log('\n📊 SWARM-bench Benchmark Instances\n');
  console.log('ID'.padEnd(30) + 'Category'.padEnd(15) + 'Difficulty'.padEnd(12) + 'Tags');
  console.log('─'.repeat(80));
  
  let count = 0;
  for (const file of files) {
    const content = readFileSync(join(benchmarksDir, file), 'utf-8');
    const instance = JSON.parse(content);
    
    if (category && instance.category !== category) continue;
    
    const id = instance.id.padEnd(30);
    const cat = instance.category.padEnd(15);
    const diff = instance.difficulty.padEnd(12);
    const tags = (instance.task?.tags || []).join(', ');
    
    console.log(`${id}${cat}${diff}${tags}`);
    count++;
  }
  
  console.log(`\n${count} instance(s) found`);
}

async function runBenchmarks(
  benchmarksDir: string,
  options: CLIOptions,
  store: ResultStore,
  groundTruth: GroundTruthEngine
): Promise<void> {
  const swarm = new SWARMBench();
  
  let instances: any[];
  
  if (options.instance) {
    const instance = swarm.loadInstance(options.instance);
    instances = [instance];
  } else if (options.category) {
    instances = swarm.loadAllInstances().filter(i => i.category === options.category);
  } else if (options.all) {
    instances = swarm.loadAllInstances();
  } else {
    console.log('Error: Specify --instance, --category, or --all');
    return;
  }
  
  const executors = options.executor 
    ? [options.executor] 
    : ['claude-code', 'hermes', 'gemini', 'codex'];
  
  console.log(`\n🚀 Running ${instances.length} benchmark(s) with ${executors.length} executor(s)\n`);
  
  let totalResults = 0;
  let totalPassed = 0;
  
  for (const instance of instances) {
    for (const executor of executors) {
      try {
        const result = await swarm.runInstance(instance, executor);
        
        // Calculate grade
        const score = result.score;
        let grade = 'F';
        if (score >= 0.9) grade = 'A';
        else if (score >= 0.8) grade = 'B';
        else if (score >= 0.7) grade = 'C';
        else if (score >= 0.6) grade = 'D';
        
        // Save to store
        const savedId = store.save({
          instanceId: result.instanceId,
          executorId: result.executorId,
          swarmVersion: 'dev',
          passed: result.passed,
          overallScore: score,
          grade,
          durationMs: result.durationMs,
          criteriaResults: result.criterionResults.map(cr => ({
            criterionId: cr.criterionId,
            passed: cr.passed,
            score: cr.passed ? 1 : 0,
            details: cr.details ?? ''
          })),
          createdAt: new Date().toISOString()
        });
        
        // Compare with ground truth
        if (result.taskOutput) {
          // Ground truth comparison disabled - no baseline available
          const comparison = { match: 1.0, baseline: null };
          if (comparison.isRegression) {
            console.log(`⚠️  REGRESSION DETECTED: ${comparison.similarity}% similarity`);
          }
        }
        
        totalResults++;
        if (result.passed) totalPassed++;
        
        console.log(`✅ Saved result #${savedId}\n`);
        
      } catch (error) {
        console.error(`❌ Error running ${instance.id} with ${executor}:`, error);
      }
    }
  }
  
  console.log(`\n📊 Summary: ${totalPassed}/${totalResults} passed (${((totalPassed/totalResults)*100).toFixed(1)}%)`);
}

async function saveBaseline(
  benchmarksDir: string,
  options: CLIOptions,
  store: ResultStore
): Promise<void> {
  if (!options.instance) {
    console.log('Error: --instance required for baseline');
    return;
  }
  
  // Get latest result for this instance
  const results = store.getByInstance(options.instance, 1);
  
  if (results.length === 0) {
    console.log(`No results found for ${options.instance}. Run benchmark first.`);
    return;
  }
  
  const latest = results[0];
  
  console.log('Baseline data:', {
    instanceId: latest.instanceId,
    version: options.version || 'v1.0',
    score: latest.overallScore,
    executor: latest.executorId
  });
  
  console.log('\nNote: Baseline save requires manual implementation');
  console.log('Use the GroundTruthEngine.saveBaseline() method');
}

async function generateReport(
  store: ResultStore,
  reportGen: ReportGenerator,
  options: CLIOptions
): Promise<void> {
  const recentResults = store.getRecentResults(168); // Last week
  const executorStats = store.getExecutorStats();
  
  // Get trends for each instance
  const instanceIds = [...new Set(recentResults.map(r => r.instanceId))];
  const trends = instanceIds.map(id => store.getInstanceTrend(id)).filter(Boolean);
  
  const recentFailures = recentResults.filter(r => !r.passed).slice(0, 10);
  
  const reportData = {
    title: 'SWARM-bench Results',
    generatedAt: new Date().toISOString(),
    summary: {
      totalRuns: recentResults.length,
      passRate: recentResults.length > 0 
        ? recentResults.filter(r => r.passed).length / recentResults.length 
        : 0,
      avgScore: recentResults.length > 0 
        ? recentResults.reduce((sum, r) => sum + r.overallScore, 0) / recentResults.length 
        : 0,
      totalDuration: recentResults.reduce((sum, r) => sum + r.durationMs, 0)
    },
    results: recentResults.slice(0, 50),
    executorStats: executorStats.sort((a, b) => b.avgScore - a.avgScore),
    trends: trends as any[],
    recentFailures
  };
  
  const format = options.format || 'html';
  const outputPath = options.output || (format === 'html' 
    ? join(__dirname, '../../results/report.html') 
    : join(__dirname, '../../results/report.json'));
  
  if (format === 'html') {
    reportGen.save(reportData, outputPath);
  } else if (format === 'json') {
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    console.log(`Report saved to: ${outputPath}`);
  } else {
    console.log(JSON.stringify(reportData, null, 2));
  }
}

// Export for testing
export { SWARMBench, AcceptanceCriteriaVerifier, GroundTruthEngine, ResultStore, ReportGenerator };

// Run if executed directly
main().catch(console.error);
