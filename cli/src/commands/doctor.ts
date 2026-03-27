import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export const doctorCommand = new Command('doctor')
  .description('Check Zouroboros system health')
  .action(async () => {
    console.log(chalk.bold('🔍 Zouroboros Health Check\n'));

    const checks: CheckResult[] = [];

    // Check Node.js version
    const nodeCheck = ora('Checking Node.js...').start();
    try {
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0]);
      if (major >= 18) {
        nodeCheck.succeed(`Node.js ${version}`);
        checks.push({ name: 'Node.js', status: 'ok', message: version });
      } else {
        nodeCheck.warn(`Node.js ${version} (recommended: >=18)`);
        checks.push({ name: 'Node.js', status: 'warn', message: version });
      }
    } catch (error) {
      nodeCheck.fail('Node.js check failed');
      checks.push({ name: 'Node.js', status: 'fail', message: 'Check failed' });
    }

    // Check Bun
    const bunCheck = ora('Checking Bun...').start();
    try {
      const output = execSync('bun --version', { encoding: 'utf-8' }).trim();
      bunCheck.succeed(`Bun ${output}`);
      checks.push({ name: 'Bun', status: 'ok', message: output });
    } catch {
      bunCheck.fail('Bun not found');
      checks.push({ name: 'Bun', status: 'fail', message: 'Not installed' });
    }

    // Check Ollama
    const ollamaCheck = ora('Checking Ollama...').start();
    try {
      execSync('curl -s http://localhost:11434/api/tags', { stdio: 'pipe' });
      ollamaCheck.succeed('Ollama running on localhost:11434');
      checks.push({ name: 'Ollama', status: 'ok', message: 'Running' });
    } catch {
      ollamaCheck.fail('Ollama not accessible');
      checks.push({ name: 'Ollama', status: 'fail', message: 'Not running' });
    }

    // Check configuration
    const configCheck = ora('Checking configuration...').start();
    const configPath = join(homedir(), '.zouroboros', 'config.json');
    if (existsSync(configPath)) {
      configCheck.succeed('Configuration file exists');
      checks.push({ name: 'Config', status: 'ok', message: configPath });
    } else {
      configCheck.fail('Configuration not initialized');
      checks.push({ name: 'Config', status: 'fail', message: 'Run: zouroboros init' });
    }

    // Summary
    console.log('\n' + chalk.bold('Summary:'));
    const ok = checks.filter(c => c.status === 'ok').length;
    const warn = checks.filter(c => c.status === 'warn').length;
    const fail = checks.filter(c => c.status === 'fail').length;

    if (fail === 0 && warn === 0) {
      console.log(chalk.green(`  ✓ All ${ok} checks passed`));
    } else {
      console.log(chalk.green(`  ✓ ${ok} passed`));
      if (warn > 0) console.log(chalk.yellow(`  ⚠ ${warn} warnings`));
      if (fail > 0) console.log(chalk.red(`  ✗ ${fail} failed`));
    }

    if (fail > 0) {
      console.log('\n' + chalk.yellow('Run `zouroboros init` to fix configuration issues'));
      process.exit(1);
    }
  });
