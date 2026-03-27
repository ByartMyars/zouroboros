#!/usr/bin/env node
import { Command } from 'commander';
import { ZOUROBOROS_VERSION } from 'zouroboros-core';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';

export const program = new Command();

program
  .name('zouroboros')
  .description('Zouroboros - Self-enhancing AI memory and orchestration')
  .version(ZOUROBOROS_VERSION);

// Core commands
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(doctorCommand);

// Placeholder commands (to be implemented)
program
  .command('memory')
  .description('Memory system commands')
  .argument('<subcommand>', 'Subcommand: store, search, hybrid, episodes')
  .action(() => {
    console.log('Memory commands coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zo-memory-system/scripts/memory.ts');
  });

program
  .command('swarm')
  .description('Swarm orchestration commands')
  .argument('<subcommand>', 'Subcommand: run, status, executor')
  .action(() => {
    console.log('Swarm commands coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zo-swarm-orchestrator/scripts/orchestrate-v5.ts');
  });

program
  .command('persona')
  .description('Persona management commands')
  .argument('<subcommand>', 'Subcommand: create, list, validate')
  .action(() => {
    console.log('Persona commands coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zo-persona-creator/scripts/interactive-setup.ts');
  });

program
  .command('introspect')
  .description('Run self-diagnostics')
  .action(() => {
    console.log('Introspection coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zouroboros-introspect/scripts/introspect.ts');
  });

program
  .command('prescribe')
  .description('Generate improvement prescriptions')
  .action(() => {
    console.log('Prescription engine coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zouroboros-prescribe/scripts/prescribe.ts');
  });

program
  .command('evolve')
  .description('Execute improvement prescriptions')
  .option('--auto', 'Run in fully autonomous mode')
  .action((options) => {
    console.log('Evolution engine coming in v2.1.0');
    console.log('Use individual packages for now:');
    console.log('  bun Skills/zouroboros-evolve/scripts/evolve.ts');
    if (options.auto) {
      console.log('Auto mode enabled (when available)');
    }
  });

// Only parse if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
