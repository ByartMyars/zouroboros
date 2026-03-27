import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from 'zouroboros-core';

export const initCommand = new Command('init')
  .description('Initialize Zouroboros configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    const spinner = ora('Initializing Zouroboros...').start();

    try {
      const configDir = join(homedir(), '.zouroboros');
      const configPath = join(configDir, 'config.json');

      // Check if already initialized
      if (existsSync(configPath) && !options.force) {
        spinner.succeed('Zouroboros is already initialized');
        console.log(chalk.gray(`Config: ${configPath}`));
        return;
      }

      // Create config directory
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Create personas directory
      const personasDir = join(configDir, 'personas');
      if (!existsSync(personasDir)) {
        mkdirSync(personasDir, { recursive: true });
      }

      // Save default configuration
      saveConfig(DEFAULT_CONFIG, configPath);

      spinner.succeed('Zouroboros initialized successfully');
      console.log(chalk.green('\nNext steps:'));
      console.log(`  ${chalk.cyan('zouroboros doctor')}    Check system health`);
      console.log(`  ${chalk.cyan('zouroboros config')}    View/edit configuration`);
      console.log();
      console.log(chalk.gray(`Config: ${configPath}`));
    } catch (error) {
      spinner.fail('Failed to initialize Zouroboros');
      console.error(error);
      process.exit(1);
    }
  });
