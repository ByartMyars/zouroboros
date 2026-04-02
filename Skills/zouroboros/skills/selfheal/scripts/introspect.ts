#!/usr/bin/env bun
/**
 * CLI for Zouroboros introspection — 7-metric health scorecard
 *
 * Usage: zouroboros-introspect [--json] [--store] [--verbose]
 */

import { parseArgs } from 'util';
import { introspect } from '../index.js';
import { formatScorecard } from '../introspect/scorecard.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    json: { type: 'boolean', short: 'j' },
    store: { type: 'boolean', short: 's' },
    verbose: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help) {
  console.log(`
zouroboros-introspect — 7-metric health scorecard for Zo ecosystem

USAGE:
  zouroboros-introspect [options]

OPTIONS:
  --json, -j      Output raw JSON scorecard
  --store, -s     Persist scorecard to ~/.zo/selfheal/
  --verbose, -v   Print formatted scorecard table
  --help, -h      Show this help

METRICS:
  memory_health     WAL size, episode count, decay distribution
  skill_coverage    Skills with SKILL.md, scripts, references
  eval_density      Evaluations per seed in last 30 days
  swarm_success     Swarm procedure pass rate
  persona_depth     Persona completeness (SOUL, rules, memory)
  graph_connectivity  Cross-entity link density in knowledge graph
  self_heal_cadence   Days since last introspect→prescribe→evolve cycle

EXAMPLES:
  zouroboros-introspect --verbose
  zouroboros-introspect --json --store
`);
  process.exit(0);
}

async function main() {
  const scorecard = await introspect({
    json: !!values.json,
    store: !!values.store,
    verbose: !!values.verbose,
  });

  if (!values.json && !values.verbose) {
    console.log(formatScorecard(scorecard));
  }
}

main().catch((err) => {
  console.error('Introspect failed:', err.message);
  process.exit(1);
});
