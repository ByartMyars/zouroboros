#!/usr/bin/env bun
/**
 * CLI for autoloop optimization
 * 
 * Usage: zouroboros-autoloop --program <program.md>
 */

import { parseArgs } from 'util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parseProgram, validateProgram } from '../autoloop/parser.js';
import { initState, shouldContinue, isBetter, runExperiment, saveResults, getStagnationLevel, getStagnationModifier } from '../autoloop/loop.js';
import type { LoopState, ProgramConfig, ExperimentRecord } from '../autoloop/types.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    program: { type: 'string', short: 'p' },
    'dry-run': { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false
});

function printHelp() {
  console.log(`
zouroboros-autoloop — Autonomous single-metric optimization

USAGE:
  zouroboros-autoloop --program <program.md>
  zouroboros-autoloop --program <program.md> --dry-run

OPTIONS:
  --program, -p   Path to program.md file (required)
  --dry-run       Parse and validate program without running
  --resume        Resume from existing autoloop branch
  --help, -h      Show this help

HOW IT WORKS:
  1. Reads your program.md configuration
  2. Creates a git branch autoloop/{name}-{date}
  3. Runs baseline (no changes)
  4. Loops until improvement or limits reached:
     - Agent proposes a change to target file
     - Commits the change
     - Runs experiment and measures metric
     - Keeps if improved, reverts if regressed
  5. Writes results.tsv with full history

EXAMPLE program.md:
  # Program: Optimize Sorting

  ## Objective
  Minimize the execution time of the sorting function.

  ## Metric
  - **name**: execution_time_ms
  - **direction**: lower_is_better
  - **extract**: grep "Time:" output.txt | awk '{print $2}'

  ## Target File
  sort.ts

  ## Run Command
  bun benchmark.ts

  ## Constraints
  - **Max experiments**: 50
  - **Max duration**: 2 hours
  - **Max cost**: $5

EXAMPLES:
  zouroboros-autoloop --program ./sort-optimization/program.md
  zouroboros-autoloop --program ./program.md --dry-run
`);
}

function printProgramSummary(config: ProgramConfig) {
  console.log('\n📋 Program Summary');
  console.log('━━━━━━━━━━━━━━━━━━━');
  console.log(`Name:     ${config.name}`);
  console.log(`Objective: ${config.objective.substring(0, 60)}...`);
  console.log(`Metric:   ${config.metric.name} (${config.metric.direction})`);
  console.log(`Target:   ${config.targetFile}`);
  console.log(`Run:      ${config.runCommand.substring(0, 50)}...`);
  console.log(`Limits:   ${config.constraints.maxExperiments} experiments, ${config.constraints.maxDurationHours}h, $${config.constraints.maxCostUSD}`);
  console.log('');
}

async function main() {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values.program) {
    console.error('Error: --program is required');
    printHelp();
    process.exit(1);
  }

  if (!existsSync(values.program)) {
    console.error(`Error: Program file not found: ${values.program}`);
    process.exit(1);
  }

  // Parse and validate
  const config = parseProgram(values.program);
  const errors = validateProgram(config);
  
  if (errors.length > 0) {
    console.error('Error: Invalid program.md:');
    for (const error of errors) {
      console.error(`  • ${error}`);
    }
    process.exit(1);
  }

  printProgramSummary(config);

  if (values['dry-run']) {
    console.log('✓ Program validated (dry run)');
    process.exit(0);
  }

  // Initialize loop
  const branchName = `autoloop/${config.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  const state = initState(config, branchName);
  
  console.log(`🚀 Starting optimization loop`);
  console.log(`   Branch: ${branchName}`);
  console.log('');

  // Note: Full autoloop implementation would require git integration
  // and an executor (Claude Code, etc.) to propose changes
  // This is a skeleton that shows the structure
  
  console.log('⚠️  Full autoloop requires git setup and an AI executor');
  console.log('   This CLI demonstrates the loop structure. To run for real:');
  console.log('');
  console.log('   1. Ensure git is initialized');
  console.log('   2. Set up an AI executor (Claude Code, etc.)');
  console.log('   3. Use the programmatic API for full control');
  console.log('');

  // Simulate loop structure
  console.log('Loop Structure:');
  console.log('━━━━━━━━━━━━━━━━');
  
  const maxIterations = Math.min(5, config.constraints.maxExperiments);
  
  for (let i = 0; i < maxIterations; i++) {
    const status = shouldContinue(state, config);
    if (!status.continue) {
      console.log(`\n⏹️  Stopping: ${status.reason}`);
      break;
    }

    state.experimentCount++;
    
    // Check stagnation
    const stagnationLevel = getStagnationLevel(state, config);
    const modifier = getStagnationModifier(stagnationLevel);
    
    console.log(`\n📊 Iteration ${i + 1}`);
    console.log(`   Best metric: ${state.bestMetric === Infinity || state.bestMetric === -Infinity ? 'N/A' : state.bestMetric}`);
    console.log(`   Stagnation: ${state.stagnationCount} (${stagnationLevel > 0 ? `Level ${stagnationLevel}` : 'None'})`);
    
    if (modifier) {
      console.log(`   Modifier: ${modifier}`);
    }
    
    // In real implementation:
    // 1. Call AI executor with proposal prompt
    // 2. Apply changes to target file
    // 3. Git commit
    // 4. Run experiment
    // 5. Extract metric
    // 6. Decide keep/revert
    
    console.log('   [Would: Propose change → Commit → Run → Measure → Keep/Revert]');
    
    // Simulate stagnation detection
    if (i > 2) {
      state.stagnationCount += 2;
    }
  }

  console.log('\n✓ Loop simulation complete');
  console.log(`   Total experiments: ${state.experimentCount}`);
  console.log(`   Best metric: ${state.bestMetric === Infinity || state.bestMetric === -Infinity ? 'N/A' : state.bestMetric}`);
  console.log('');
  console.log('For full implementation, see the programmatic API:');
  console.log('  import { runAutoloop } from "zouroboros-workflow";');
}

main().catch(console.error);
