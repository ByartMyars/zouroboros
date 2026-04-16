import { Command } from 'commander';
import { spawn } from 'child_process';
import { join, resolve } from 'path';

/**
 * Monorepo-relative path to the memory package's CLI entry point.
 * Resolves regardless of whether this file is run from source (ts) or
 * built output (dist/cli/src/commands/memory.js).
 */
const MEMORY_CLI = resolve(
  import.meta.dirname || __dirname,
  '../../../packages/memory/src/cli.ts'
);

function runMemory(args: string[]) {
  spawn('bun', [MEMORY_CLI, ...args], { stdio: 'inherit' });
}

export const memoryCommand = new Command('memory')
  .description('Memory system commands')
  .addCommand(
    new Command('search')
      .description('Search memory')
      .argument('<query>', 'Search query')
      .option('--limit <n>', 'Limit results', '10')
      .action((query, options) => {
        runMemory(['search', query, '--limit', options.limit]);
      })
  )
  .addCommand(
    new Command('store')
      .description('Store a fact')
      .requiredOption('--entity <entity>', 'Entity name')
      .requiredOption('--key <key>', 'Key')
      .requiredOption('--value <value>', 'Value')
      .action((options) => {
        runMemory([
          'store',
          '--entity', options.entity,
          '--key', options.key,
          '--value', options.value,
        ]);
      })
  )
  .addCommand(
    new Command('stats')
      .description('Show memory statistics')
      .action(() => {
        runMemory(['--stats']);
      })
  )
  .addCommand(
    new Command('metrics')
      .description('Memory metrics dashboard (MEM-101)')
      .argument('[action]', 'report|record|clear')
      .allowUnknownOption()
      .action((action, _opts, cmd) => {
        const rest = cmd.args.slice(action ? 1 : 0);
        runMemory(['metrics', ...(action ? [action] : []), ...rest]);
      })
  )
  .addCommand(
    new Command('import')
      .description('Import facts from external sources (MEM-102)')
      .option('--source <type>', 'Source type')
      .option('--path <path>', 'Source path')
      .allowUnknownOption()
      .action((_opts, cmd) => {
        runMemory(['import', ...cmd.args]);
      })
  )
  .addCommand(
    new Command('budget')
      .description('Context budget tracking (MEM-001)')
      .argument('[action]', 'init|status|track|reset')
      .allowUnknownOption()
      .action((action, _opts, cmd) => {
        const rest = cmd.args.slice(action ? 1 : 0);
        runMemory(['budget', ...(action ? [action] : []), ...rest]);
      })
  )
  .addCommand(
    new Command('summarize')
      .description('Episode summarization (MEM-002)')
      .allowUnknownOption()
      .action((_opts, cmd) => {
        runMemory(['summarize', ...cmd.args]);
      })
  )
  .addCommand(
    new Command('multi-hop')
      .description('Multi-hop retrieval (MEM-003)')
      .argument('[action]', 'retrieve|benchmark')
      .allowUnknownOption()
      .action((action, _opts, cmd) => {
        const rest = cmd.args.slice(action ? 1 : 0);
        runMemory(['multi-hop', ...(action ? [action] : []), ...rest]);
      })
  )
  .addCommand(
    new Command('conflicts')
      .description('Conflict resolution (MEM-103)')
      .argument('[action]', 'detect|resolve|stats')
      .allowUnknownOption()
      .action((action, _opts, cmd) => {
        const rest = cmd.args.slice(action ? 1 : 0);
        runMemory(['conflicts', ...(action ? [action] : []), ...rest]);
      })
  )
  .addCommand(
    new Command('cross-persona')
      .description('Cross-persona memory tools (MEM-104)')
      .allowUnknownOption()
      .action((_opts, cmd) => {
        runMemory(['cross-persona', ...cmd.args]);
      })
  )
  .addCommand(
    new Command('graph-traversal')
      .description('Graph traversal tools (MEM-105)')
      .allowUnknownOption()
      .action((_opts, cmd) => {
        runMemory(['graph-traversal', ...cmd.args]);
      })
  )
  .addCommand(
    new Command('embed-bench')
      .description('Embedding model benchmark (MEM-202)')
      .argument('[action]', 'compare|benchmark')
      .allowUnknownOption()
      .action((action, _opts, cmd) => {
        const rest = cmd.args.slice(action ? 1 : 0);
        runMemory(['embed-bench', ...(action ? [action] : []), ...rest]);
      })
  );
