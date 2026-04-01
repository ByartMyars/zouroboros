/**
 * Doctor utility - Health check for Zouroboros components
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { loadConfig, PATHS } from 'zouroboros-core';

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  fixable?: boolean;
}

export async function runDoctor(options: { fix?: boolean } = {}): Promise<boolean> {
  const checks: CheckResult[] = [];

  // Check 1: Configuration exists
  const configPath = join(homedir(), '.zouroboros', 'config.json');
  if (existsSync(configPath)) {
    checks.push({ name: 'Configuration', status: 'ok', message: `Found at ${configPath}` });
  } else {
    checks.push({ 
      name: 'Configuration', 
      status: 'error', 
      message: 'Not found. Run: zouroboros init',
      fixable: true 
    });
  }

  // Check 2: Memory database
  const memoryDb = PATHS.memoryDb;
  if (existsSync(memoryDb)) {
    try {
      const result = execSync(`sqlite3 "${memoryDb}" "SELECT COUNT(*) FROM facts;"`, { encoding: 'utf-8' });
      const count = parseInt(result.trim());
      checks.push({ name: 'Memory Database', status: 'ok', message: `${count} facts stored` });
    } catch {
      checks.push({ name: 'Memory Database', status: 'warning', message: 'Exists but schema may need migration' });
    }
  } else {
    checks.push({ 
      name: 'Memory Database', 
      status: 'warning', 
      message: 'Not initialized. Will be created on first use.',
      fixable: true 
    });
  }

  // Check 3: Ollama (for embeddings)
  try {
    execSync('curl -s http://localhost:11434/api/tags > /dev/null', { timeout: 5000 });
    checks.push({ name: 'Ollama', status: 'ok', message: 'Running on localhost:11434' });
  } catch {
    checks.push({ 
      name: 'Ollama', 
      status: 'warning', 
      message: 'Not running. Vector search will be limited.',
      fixable: false 
    });
  }

  // Check 4: Swarm executors
  const executors = ['claude-code', 'codex', 'gemini', 'hermes'];
  const availableExecutors: string[] = [];
  
  for (const executor of executors) {
    try {
      execSync(`command -v ${executor} > /dev/null 2>&1`);
      availableExecutors.push(executor);
    } catch {
      // Not available
    }
  }

  if (availableExecutors.length > 0) {
    checks.push({ 
      name: 'Swarm Executors', 
      status: 'ok', 
      message: `${availableExecutors.length} available: ${availableExecutors.join(', ')}` 
    });
  } else {
    checks.push({ 
      name: 'Swarm Executors', 
      status: 'error', 
      message: 'None found. Install at least one: claude-code, codex, gemini, or hermes',
      fixable: false 
    });
  }

  // Check 6: Git
  try {
    execSync('command -v git > /dev/null 2>&1');
    checks.push({ name: 'Git', status: 'ok', message: 'Available' });
  } catch {
    checks.push({ name: 'Git', status: 'error', message: 'Not found. Required for autoloop.' });
  }

  // Print results
  console.log('Component Status:');
  console.log('─'.repeat(60));
  
  for (const check of checks) {
    const icon = check.status === 'ok' ? chalk.green('✓') : 
                 check.status === 'warning' ? chalk.yellow('⚠') : chalk.red('✗');
    const name = chalk.bold(check.name.padEnd(20));
    const message = check.status === 'error' ? chalk.red(check.message) :
                    check.status === 'warning' ? chalk.yellow(check.message) :
                    chalk.gray(check.message);
    
    console.log(`${icon} ${name} ${message}`);
  }

  // Attempt fixes if requested
  if (options.fix) {
    const fixable = checks.filter(c => c.fixable && c.status !== 'ok');
    if (fixable.length > 0) {
      console.log(chalk.cyan('\n🔧 Attempting fixes...\n'));
      
      for (const check of fixable) {
        console.log(`Fixing ${check.name}...`);
        // Implementation would go here
      }
    }
  }

  return checks.every(c => c.status !== 'error');
}