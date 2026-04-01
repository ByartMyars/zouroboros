import { Command } from 'commander';
import chalk from 'chalk';
import { runDoctor } from '../utils/doctor.js';

export const doctorCommand = new Command('doctor')
  .description('Run health check on all Zouroboros components')
  .option('--fix', 'Attempt to fix issues automatically')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔍 Zouroboros Health Check\n'));

    const healthy = await runDoctor({ fix: options.fix });
    process.exit(healthy ? 0 : 1);
  });
