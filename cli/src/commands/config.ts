import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigValue, setConfigValue } from 'zouroboros-core';

export const configCommand = new Command('config')
  .description('Manage Zouroboros configuration')
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key (dot notation, e.g., memory.ollamaUrl)')
      .action((key) => {
        const config = loadConfig();
        const value = getConfigValue(config, key);
        if (value === undefined) {
          console.log(chalk.yellow(`Key '${key}' not found`));
          process.exit(1);
        }
        console.log(value);
      })
  )
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key (dot notation)')
      .argument('<value>', 'Value to set')
      .action((key, value) => {
        const config = loadConfig();
        
        // Try to parse as JSON for non-string values
        let parsedValue: unknown = value;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string
        }
        
        const newConfig = setConfigValue(config, key, parsedValue);
        saveConfig(newConfig);
        console.log(chalk.green(`Set ${key} = ${value}`));
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configuration values')
      .alias('ls')
      .action(() => {
        const config = loadConfig();
        console.log(chalk.bold('Zouroboros Configuration:'));
        console.log();
        console.log(JSON.stringify(config, null, 2));
      })
  )
  .addCommand(
    new Command('edit')
      .description('Open configuration in $EDITOR')
      .action(() => {
        const { spawn } = await import('child_process');
        const editor = process.env.EDITOR || 'vi';
        const { DEFAULT_CONFIG_PATH } = await import('zouroboros-core');
        
        spawn(editor, [DEFAULT_CONFIG_PATH], {
          stdio: 'inherit',
          detached: false,
        });
      })
  );
