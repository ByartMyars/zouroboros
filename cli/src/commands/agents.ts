import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const MARKER_PATH = join(homedir(), '.zouroboros', 'agents-registered.json');

export const agentsCommand = new Command('agents')
  .description('Manage Zouroboros scheduled agents')
  .addCommand(
    new Command('sync')
      .description('Mark agents as registered after creating them in Zo Chat')
      .action(() => {
        const monorepoRoot = join(__dirname, '..', '..', '..');
        const manifestPath = join(monorepoRoot, 'agents', 'manifest.json');

        if (!existsSync(manifestPath)) {
          console.error(chalk.red('agents/manifest.json not found'));
          process.exit(1);
        }

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const agentEntries = Object.entries(manifest.agents || {}) as [string, any][];

        const marker = {
          registeredAt: new Date().toISOString(),
          agents: agentEntries.map(([slug, spec]) => ({
            slug,
            title: spec.title,
          })),
        };

        mkdirSync(dirname(MARKER_PATH), { recursive: true });
        writeFileSync(MARKER_PATH, JSON.stringify(marker, null, 2));
        console.log(chalk.green(`✓ Marked ${agentEntries.length} agents as registered`));
        console.log(chalk.gray(`  Written to ${MARKER_PATH}`));
      })
  )
  .addCommand(
    new Command('status')
      .description('Show agent registration status')
      .action(() => {
        if (!existsSync(MARKER_PATH)) {
          console.log(chalk.yellow('No agents registered. Run: zouroboros agents sync'));
          return;
        }
        const marker = JSON.parse(readFileSync(MARKER_PATH, 'utf-8'));
        console.log(chalk.green(`${marker.agents.length} agents registered at ${marker.registeredAt}`));
        for (const agent of marker.agents) {
          console.log(chalk.gray(`  • ${agent.title}`));
        }
      })
  );
