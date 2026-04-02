import { Command } from 'commander';
import { spawn } from 'child_process';
import { join, resolve } from 'path';

const PACKAGES = resolve(import.meta.dirname || __dirname, '../../../packages');

function runCli(pkg: string, cli: string, args: string[] = []) {
  spawn('bun', [join(PACKAGES, pkg, 'src/cli', `${cli}.ts`), ...args], {
    stdio: 'inherit',
  });
}

export const workflowCommand = new Command('workflow')
  .description('Workflow tools (interview, evaluate, unstuck, autoloop)')
  .addCommand(
    new Command('interview')
      .description('Run spec-first interview')
      .option('--topic <topic>', 'Interview topic')
      .action((options) => {
        const args = options.topic ? ['--topic', options.topic] : [];
        runCli('workflow', 'interview', args);
      })
  )
  .addCommand(
    new Command('evaluate')
      .description('Run three-stage evaluation')
      .requiredOption('--seed <path>', 'Seed specification file')
      .requiredOption('--artifact <path>', 'Artifact to evaluate')
      .action((options) => {
        runCli('workflow', 'evaluate', ['--seed', options.seed, '--artifact', options.artifact]);
      })
  )
  .addCommand(
    new Command('unstuck')
      .description('Run unstuck lateral thinking')
      .argument('<problem>', 'Description of what you are stuck on')
      .action((problem) => {
        runCli('workflow', 'unstuck', [problem]);
      })
  )
  .addCommand(
    new Command('autoloop')
      .description('Run autoloop optimization')
      .requiredOption('--program <path>', 'Program.md file')
      .action((options) => {
        runCli('workflow', 'autoloop', ['--program', options.program]);
      })
  );

export const selfhealCommand = new Command('selfheal')
  .description('Self-enhancement tools (introspect, prescribe, evolve)')
  .addCommand(
    new Command('introspect')
      .description('Run 7-metric health scorecard')
      .option('--json', 'Output raw JSON')
      .option('--store', 'Persist scorecard')
      .option('--verbose', 'Print formatted table')
      .action((options) => {
        const args: string[] = [];
        if (options.json) args.push('--json');
        if (options.store) args.push('--store');
        if (options.verbose) args.push('--verbose');
        runCli('selfheal', 'introspect', args);
      })
  )
  .addCommand(
    new Command('prescribe')
      .description('Generate improvement prescription')
      .option('--scorecard <path>', 'Path to scorecard JSON')
      .option('--target <metric>', 'Target metric name')
      .option('--live', 'Run live introspection')
      .option('--dry-run', 'Preview without writing')
      .action((options) => {
        const args: string[] = [];
        if (options.scorecard) args.push('--scorecard', options.scorecard);
        if (options.target) args.push('--target', options.target);
        if (options.live) args.push('--live');
        if (options.dryRun) args.push('--dry-run');
        runCli('selfheal', 'prescribe', args);
      })
  )
  .addCommand(
    new Command('evolve')
      .description('Execute prescription with regression detection')
      .option('--prescription <path>', 'Path to prescription JSON')
      .option('--dry-run', 'Preview without changes')
      .option('--skip-governor', 'Bypass governor safety gate')
      .action((options) => {
        const args: string[] = [];
        if (options.prescription) args.push('--prescription', options.prescription);
        if (options.dryRun) args.push('--dry-run');
        if (options.skipGovernor) args.push('--skip-governor');
        runCli('selfheal', 'evolve', args);
      })
  );
