#!/usr/bin/env bun
/**
 * CLI for Zouroboros evolve — execute prescriptions with regression detection
 *
 * Usage: zouroboros-evolve [--prescription <path>] [--dry-run] [--skip-governor]
 */

import { parseArgs } from 'util';
import { evolve } from '../index.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    prescription: { type: 'string', short: 'p' },
    'dry-run': { type: 'boolean' },
    'skip-governor': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help) {
  console.log(`
zouroboros-evolve — execute prescriptions with regression detection

USAGE:
  zouroboros-evolve [options]

OPTIONS:
  --prescription, -p   Path to prescription JSON (default: run prescribe first)
  --dry-run            Show what would be executed without making changes
  --skip-governor      Bypass the governor safety gate (use with caution)
  --help, -h           Show this help

SAFETY:
  The governor gate blocks prescriptions with high regression risk.
  Use --skip-governor only for manual overrides after review.
  All evolutions are git-committed for rollback capability.

EXAMPLES:
  zouroboros-evolve --prescription ./prescription.json
  zouroboros-evolve --dry-run
  zouroboros-evolve --prescription ./rx.json --skip-governor
`);
  process.exit(0);
}

async function main() {
  const result = await evolve({
    prescription: values.prescription as string | undefined,
    dryRun: !!values['dry-run'],
    skipGovernor: !!values['skip-governor'],
  });

  if (result.success) {
    console.log(`✓ Evolution complete`);
    console.log(`  Delta:    ${(result.delta * 100).toFixed(1)}%`);
    console.log(`  Reverted: ${result.reverted ? 'yes' : 'no'}`);
    console.log(`  Detail:   ${result.detail}`);
  } else {
    console.error(`✗ Evolution failed: ${result.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Evolve failed:', err.message);
  process.exit(1);
});
