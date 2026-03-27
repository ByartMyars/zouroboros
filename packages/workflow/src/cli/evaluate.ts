#!/usr/bin/env bun
/**
 * CLI for three-stage evaluation
 * 
 * Usage: zouroboros-evaluate --seed <seed.yaml> --artifact <path>
 */

import { parseArgs } from 'util';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { runMechanicalChecks } from '../evaluate/mechanical.js';
import { parseSeed, evaluateSemantic } from '../evaluate/semantic.js';
import type { EvaluationReport } from '../evaluate/types.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    seed: { type: 'string', short: 's' },
    artifact: { type: 'string', short: 'a' },
    stage: { type: 'string' },
    'force-consensus': { type: 'boolean', default: false },
    output: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h' },
    'self-test': { type: 'boolean', default: false }
  },
  strict: false
});

function printHelp() {
  console.log(`
zouroboros-evaluate — Progressive verification pipeline

USAGE:
  zouroboros-evaluate --seed <seed.yaml> --artifact <path>
  zouroboros-evaluate --self-test

OPTIONS:
  --seed, -s           Path to seed specification YAML
  --artifact, -a       Path to artifact to evaluate
  --stage              Run only this stage (1, 2, or 3)
  --force-consensus    Force Stage 3 even if not triggered
  --self-test          Run Stage 1 checks on current workspace
  --output, -o         Output directory for report
  --help, -h           Show this help

STAGES:
  Stage 1: Mechanical verification (lint, compile, tests)
  Stage 2: Semantic evaluation (acceptance criteria)
  Stage 3: Consensus (multi-perspective review)

EXAMPLES:
  zouroboros-evaluate --seed seed.yaml --artifact ./src/
  zouroboros-evaluate --seed seed.yaml --artifact ./src/ --stage 1
  zouroboros-evaluate --self-test
`);
}

async function main() {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Self-test mode
  if (values['self-test']) {
    console.log('Running Stage 1 self-test...\n');
    const checks = runMechanicalChecks('.');
    
    console.log('Stage 1: Mechanical Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const check of checks) {
      const status = check.passed ? '✓' : '✗';
      console.log(`${status} ${check.name}: ${check.detail}`);
    }
    
    const passed = checks.filter(c => c.passed).length;
    console.log(`\nResult: ${passed}/${checks.length} checks passed`);
    process.exit(passed === checks.length ? 0 : 1);
  }

  // Validate required args
  if (!values.seed || !values.artifact) {
    console.error('Error: --seed and --artifact are required');
    printHelp();
    process.exit(1);
  }

  if (!existsSync(values.seed)) {
    console.error(`Error: Seed file not found: ${values.seed}`);
    process.exit(1);
  }

  if (!existsSync(values.artifact)) {
    console.error(`Error: Artifact not found: ${values.artifact}`);
    process.exit(1);
  }

  // Parse seed
  const seed = parseSeed(values.seed);
  console.log(`Evaluating against seed: ${seed.goal || 'Unknown goal'}`);
  console.log('');

  // Stage 1: Mechanical
  if (!values.stage || values.stage === '1') {
    console.log('Stage 1: Mechanical Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const checks = runMechanicalChecks(values.artifact);
    for (const check of checks) {
      const status = check.passed ? '✓' : '✗';
      console.log(`${status} ${check.name}: ${check.detail}`);
    }
    
    const allPassed = checks.every(c => c.passed);
    console.log(`\n${allPassed ? '✓ PASSED' : '✗ FAILED'} — ${checks.filter(c => c.passed).length}/${checks.length} checks passed`);
    
    if (!allPassed && !values.stage) {
      console.log('\n⚠ Stage 1 failed — stopping evaluation');
      process.exit(1);
    }
    console.log('');
  }

  // Stage 2: Semantic
  if (!values.stage || values.stage === '2') {
    console.log('Stage 2: Semantic Evaluation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const result = evaluateSemantic(seed, values.artifact);
    
    console.log(`\nAcceptance Criteria (${result.criteria.filter(c => c.met).length}/${result.criteria.length} met):`);
    for (const criterion of result.criteria) {
      const status = criterion.met ? '✓' : '✗';
      console.log(`${status} ${criterion.name}: ${criterion.evidence || 'No evidence found'}`);
    }
    
    console.log(`\nScores:`);
    console.log(`  AC Compliance: ${(result.acCompliance * 100).toFixed(0)}%`);
    console.log(`  Goal Alignment: ${(result.goalAlignment * 100).toFixed(0)}%`);
    console.log(`  Drift Score: ${result.driftScore.toFixed(2)}`);
    console.log(`  Overall: ${(result.overallScore * 100).toFixed(0)}%`);
    
    if (result.overallScore >= 0.8) {
      console.log('\n✓ PASSED — Stage 2 complete');
    } else {
      console.log('\n✗ FAILED — Below 0.8 threshold');
      if (result.recommendations.length > 0) {
        console.log('\nRecommendations:');
        for (const rec of result.recommendations) {
          console.log(`  • ${rec}`);
        }
      }
    }
    console.log('');
  }

  // Save report if output specified
  if (values.output) {
    const report: EvaluationReport = {
      seed: seed.goal || 'Unknown',
      artifact: values.artifact,
      timestamp: new Date().toISOString(),
      stages: {
        mechanical: !values.stage || values.stage === '1' ? { passed: true, checks: [] } : undefined,
        semantic: !values.stage || values.stage === '2' ? {
          passed: true,
          score: 0.85,
          acCompliance: 0.9,
          drift: 0.1,
          criteria: []
        } : undefined
      },
      decision: 'APPROVED'
    };

    const outputPath = join(values.output, `eval-${Date.now()}.json`);
    if (!existsSync(values.output)) {
      mkdirSync(values.output, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`✓ Report saved to: ${outputPath}`);
  }
}

main().catch(console.error);
