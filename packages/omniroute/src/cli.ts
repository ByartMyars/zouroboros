/#!/usr/bin/env bun
/**
 * CLI for Zouroboros OmniRoute
 * 
 * Command-line interface for resolving tasks to optimal model combos.
 * 
 * @example
 * ```bash
 * # Get recommended combo for a task
 * zouroboros-omniroute "Fix the authentication bug in login.ts"
 * 
 * # Full JSON output with OmniRoute integration
 * zouroboros-omniroute --omniroute --json "Implement a webhook retry system"
 * 
 * # Apply constraints
 * zouroboros-omniroute --budget low --speed high "Quick review of the PR"
 * ```
 */

import { resolve, resolveJSON, resolveQuick } from './resolver.js';
import type { ConstraintValue } from './types.js';

interface CliOptions {
  omniroute: boolean;
  json: boolean;
  budget?: ConstraintValue;
  latency?: ConstraintValue;
  quality?: ConstraintValue;
  speed?: ConstraintValue;
  taskText: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    omniroute: false,
    json: false,
    taskText: '',
  };

  const skipIndices = new Set<number>();

  for (let i = 0; i < args.length; i++) {
    if (skipIndices.has(i)) continue;

    const arg = args[i];

    switch (arg) {
      case '--omniroute':
      case '-o':
        options.omniroute = true;
        break;
      case '--json':
      case '-j':
        options.json = true;
        break;
      case '--budget':
      case '-b':
        options.budget = args[i + 1] as ConstraintValue;
        skipIndices.add(i + 1);
        break;
      case '--latency':
      case '-l':
        options.latency = args[i + 1] as ConstraintValue;
        skipIndices.add(i + 1);
        break;
      case '--quality':
      case '-q':
        options.quality = args[i + 1] as ConstraintValue;
        skipIndices.add(i + 1);
        break;
      case '--speed':
      case '-s':
        options.speed = args[i + 1] as ConstraintValue;
        skipIndices.add(i + 1);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('-')) {
          options.taskText += (options.taskText ? ' ' : '') + arg;
        }
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Zouroboros OmniRoute - Intelligent Model Combo Resolver

Usage: zouroboros-omniroute [options] <task prompt>

Options:
  -o, --omniroute    Query OmniRoute for best combo recommendation
  -j, --json         Output full JSON (signals, domain, constraints)
  -b, --budget       Budget constraint: low | medium | high
  -l, --latency      Latency constraint: low | medium | high
  -q, --quality      Quality constraint: low | medium | high
  -s, --speed        Speed constraint: low | medium | high
  -h, --help         Show this help message

Environment Variables:
  OMNIROUTE_URL      OmniRoute base URL (default: http://localhost:20128)
  OMNIROUTE_API_KEY  OmniRoute API key

Examples:
  # Quick combo recommendation
  zouroboros-omniroute "Fix the login bug"

  # With OmniRoute integration
  zouroboros-omniroute --omniroute "Implement webhook retry"

  # Full analysis output
  zouroboros-omniroute --json --omniroute "Review the PR"

  # With constraints
  zouroboros-omniroute --budget low --speed high "Quick fix"
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.taskText.trim()) {
    console.error('Error: No task text provided');
    printHelp();
    process.exit(1);
  }

  try {
    if (options.json || options.omniroute) {
      const result = await resolveJSON({
        taskText: options.taskText,
        useOmniRoute: options.omniroute,
        budget: options.budget,
        latency: options.latency,
        quality: options.quality,
        speed: options.speed,
      });
      console.log(JSON.stringify(result, null, 2));
    } else {
      const combo = resolveQuick(options.taskText);
      console.log(combo);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
