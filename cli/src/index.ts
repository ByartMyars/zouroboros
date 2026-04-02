#!/usr/bin/env bun
/**
 * Zouroboros CLI
 * 
 * Unified command-line interface for all Zouroboros packages.
 * 
 * @module zouroboros-cli
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, VERSION } from 'zouroboros-core';

// Import commands
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { configCommand } from './commands/config.js';
import { memoryCommand } from './commands/memory.js';
import { swarmCommand } from './commands/swarm.js';
import { personaCommand } from './commands/persona.js';
import { workflowCommand, selfhealCommand } from './commands/workflow.js';
import { healCommand } from './commands/heal.js';
import { tuiCommand } from './commands/tui.js';
import { backupCommand } from './commands/backup.js';
import { migrateCommand } from './commands/migrate.js';
import { skillsCommand } from './commands/skills.js';
import { agentsCommand } from './commands/agents.js';

const program = new Command();

program
  .name('zouroboros')
  .description('🐍⭕ Zouroboros - Self-enhancing AI memory and orchestration system')
  .version(VERSION, '-v, --version', 'Display version number')
  .helpOption('-h, --help', 'Display help for command')
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });

// Global options
program
  .option('--config <path>', 'Path to config file')
  .option('--verbose', 'Enable verbose output')
  .option('--json', 'Output as JSON');

// Register commands
program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(configCommand);
program.addCommand(memoryCommand);
program.addCommand(swarmCommand);
program.addCommand(personaCommand);
program.addCommand(workflowCommand);
program.addCommand(selfhealCommand);
program.addCommand(healCommand);
program.addCommand(tuiCommand);
program.addCommand(backupCommand);
program.addCommand(migrateCommand);
program.addCommand(skillsCommand);
program.addCommand(agentsCommand);

// Default action (no command)
program.action(() => {
  console.log(chalk.cyan('\n🐍⭕ Zouroboros'));
  console.log(chalk.gray('Self-enhancing AI memory and orchestration system\n'));
  console.log('Run ' + chalk.yellow('zouroboros --help') + ' for available commands\n');
});

// Error handling
program.exitOverride();

try {
  await program.parseAsync();
} catch (err: any) {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code === 'commander.unknownOption') {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
  if (err.code === 'commander.missingArgument') {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
  throw err;
}