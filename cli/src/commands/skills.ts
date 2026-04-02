import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname || __dirname, '../../..');

export const skillsCommand = new Command('skills')
  .description('Manage Zouroboros skills')
  .addCommand(
    new Command('install')
      .description('Export skills to ~/Skills/ (or custom directory)')
      .option('--dest <dir>', 'Target directory (default: ~/Skills)')
      .option('--skill <name>', 'Install a single skill by name')
      .action((options) => {
        const args: string[] = [];
        if (options.dest) args.push('--dest', options.dest);
        if (options.skill) args.push('--skill', options.skill);
        spawn('bash', [resolve(REPO_ROOT, 'scripts/export-skills.sh'), ...args], {
          stdio: 'inherit',
        });
      })
  )
  .addCommand(
    new Command('list')
      .description('List available skills')
      .action(() => {
        console.log(`
Zouroboros Skills
═════════════════

Workflow Skills (packages/workflow):
  spec-first-interview    Socratic interview & seed specification generator
  three-stage-eval        Mechanical/semantic/consensus evaluation pipeline
  autoloop                Single-metric optimization loop (inspired by autoresearch)
  unstuck-lateral         5 lateral-thinking personas for creative problem solving

Self-Enhancement Skills (packages/selfheal):
  zouroboros-introspect   7-metric health scorecard for Zo ecosystem
  zouroboros-prescribe    Auto-generate improvement prescriptions from scorecard
  zouroboros-evolve       Execute prescriptions with regression detection

Install:
  zouroboros skills install              # Export all to ~/Skills/
  zouroboros skills install --skill autoloop  # Export one skill
  zouroboros skills install --dest ./my-skills # Custom directory
`);
      })
  );
