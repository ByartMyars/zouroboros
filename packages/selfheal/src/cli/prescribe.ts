#!/usr/bin/env bun
/**
 * CLI for Zouroboros prescribe — auto-generate improvement seeds
 *
 * Usage: zouroboros-prescribe [--scorecard <path>] [--target <metric>] [--live] [--output <dir>] [--dry-run]
 */

import { parseArgs } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prescribe } from '../index.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    scorecard: { type: 'string', short: 's' },
    target: { type: 'string', short: 't' },
    live: { type: 'boolean', short: 'l' },
    output: { type: 'string', short: 'o', default: '.' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help) {
  console.log(`
zouroboros-prescribe — generate improvement prescriptions from scorecard

USAGE:
  zouroboros-prescribe [options]

OPTIONS:
  --scorecard, -s  Path to a saved scorecard JSON (default: run live introspect)
  --target, -t     Target metric name (default: weakest metric)
  --live, -l       Run live introspection instead of using cached scorecard
  --output, -o     Output directory for prescription (default: .)
  --dry-run        Show what would be prescribed without writing files
  --help, -h       Show this help

PLAYBOOKS:
  14 playbooks map metrics to concrete improvement strategies.
  The governor gate evaluates risk before approving execution.

EXAMPLES:
  zouroboros-prescribe --live --target memory_health
  zouroboros-prescribe --scorecard ./scorecard.json --output ./prescriptions
  zouroboros-prescribe --dry-run
`);
  process.exit(0);
}

async function main() {
  const prescription = await prescribe({
    scorecard: values.scorecard as string | undefined,
    live: !!values.live,
    target: values.target as string | undefined,
  });

  if (values['dry-run']) {
    console.log('\n[dry-run] Prescription:');
    console.log(JSON.stringify(prescription, null, 2));
    return;
  }

  const outDir = (values.output as string) || '.';
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `prescription-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(prescription, null, 2));
  console.log(`✓ Prescription written to: ${outPath}`);
  console.log(`  Metric:   ${prescription.metric.name} (${(prescription.metric.score * 100).toFixed(0)}%)`);
  console.log(`  Playbook: ${prescription.playbook.name}`);
  console.log(`  Governor: ${prescription.governor.approved ? 'APPROVED' : 'BLOCKED'}`);
}

main().catch((err) => {
  console.error('Prescribe failed:', err.message);
  process.exit(1);
});
