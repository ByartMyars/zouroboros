import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { createRequire } from 'module';
import { existsSync } from 'fs';

const nodeRequire = createRequire(import.meta.url);

/**
 * Locate the memory package's CLI entry point.
 *
 * Preference order:
 *   1. `zouroboros-memory/cli` subpath export — works when this CLI is
 *      installed as a published npm package alongside `zouroboros-memory`.
 *   2. Monorepo-relative source path — works when running directly from a
 *      clone of the repo (dev mode, pre-publish).
 *
 * Cached on first successful resolution.
 */
let cachedMemoryCli: string | undefined;
function resolveMemoryCli(): string {
  if (cachedMemoryCli) return cachedMemoryCli;
  try {
    cachedMemoryCli = nodeRequire.resolve('zouroboros-memory/cli');
    return cachedMemoryCli;
  } catch {
    // fall through to monorepo fallback
  }
  const monorepoPath = resolve(
    import.meta.dirname || __dirname,
    '../../../packages/memory/src/cli.ts'
  );
  if (existsSync(monorepoPath)) {
    cachedMemoryCli = monorepoPath;
    return cachedMemoryCli;
  }
  throw new Error(
    'Unable to locate zouroboros-memory CLI. Install `zouroboros-memory` or run from a monorepo clone with packages/memory present.'
  );
}

function runMemory(args: string[]) {
  let target: string;
  try {
    target = resolveMemoryCli();
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }
  const child = spawn('bun', [target, ...args], { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error(`Failed to spawn memory CLI: ${err.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
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
