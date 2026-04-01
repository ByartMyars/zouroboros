#!/usr/bin/env bun
import { parseArgs } from 'util';
import { join } from 'path';
import { VERSION } from './index.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    stats: { type: 'boolean', short: 's' },
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
  allowPositionals: true,
});

function printHelp() {
  console.log(`
zouroboros-memory v${VERSION} — Hybrid SQLite + Vector memory system

USAGE:
  zouroboros-memory [options]
  zouroboros-memory <command> [args]

OPTIONS:
  --stats, -s    Show memory database statistics
  --version, -v  Show version
  --help, -h     Show this help

COMMANDS (v4 enhancements):
  metrics [report|record|clear]     Memory system metrics dashboard (MEM-101)
  import --source <type> --path <p> Import from external sources (MEM-102)
  budget [init|status|track|reset]  Context budget tracking (MEM-001)
  summarize [args]                  Episode summarization (MEM-002)
  multi-hop [retrieve|benchmark]    Multi-hop retrieval (MEM-003)
  conflicts [detect|resolve|stats]  Conflict resolution (MEM-103)
  cross-persona [args]              Cross-persona memory (MEM-104)
  graph-traversal [args]            Graph traversal tools (MEM-105)
  embed-bench [compare|benchmark]   Embedding model benchmark (MEM-202)

PROGRAMMATIC USAGE:
  import { init, storeFact, searchFacts } from 'zouroboros-memory';
`);
}

if (values.help) {
  printHelp();
  process.exit(0);
}

if (values.version) {
  console.log(`zouroboros-memory v${VERSION}`);
  process.exit(0);
}

if (values.stats) {
  console.log('Memory system statistics:');
  console.log('  Run "zouroboros doctor" for a full health check.');
  console.log('  Or use the programmatic API: import { getStats } from "zouroboros-memory"');
  process.exit(0);
}

// v4 subcommand routing — delegates to individual script CLIs
const command = positionals[0];

if (command) {
  const { execSync } = require('child_process');
  const srcDir = import.meta.dir;
  const subArgs = process.argv.slice(3).join(' ');

  const commandMap: Record<string, string> = {
    'metrics': 'metrics.ts',
    'import': 'import-pipeline.ts',
    'budget': 'context-budget.ts',
    'summarize': 'episode-summarizer.ts',
    'multi-hop': 'multi-hop.ts',
    'conflicts': 'conflict-resolver.ts',
    'cross-persona': 'cross-persona.ts',
    'graph-traversal': 'graph-traversal.ts',
    'embed-bench': 'embedding-benchmark.ts',
  };

  const scriptFile = commandMap[command];
  if (scriptFile) {
    const scriptPath = join(srcDir, scriptFile);
    try {
      execSync(`bun "${scriptPath}" ${subArgs}`, { stdio: 'inherit' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Command "${command}" failed: ${msg}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

printHelp();
