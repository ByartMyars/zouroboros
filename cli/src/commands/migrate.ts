import { Command } from 'commander';
import chalk from 'chalk';
import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';
import { loadConfig, createMigrationRunner, MIGRATIONS } from 'zouroboros-core';

function openDb(): Database {
  const config = loadConfig();
  if (!existsSync(config.memory.dbPath)) {
    console.error(chalk.red(`\n❌ Database not found at ${config.memory.dbPath}`));
    console.error(chalk.gray('  Run "zouroboros init" first to create the database.\n'));
    process.exit(1);
  }
  return new Database(config.memory.dbPath);
}

export const migrateCommand = new Command('migrate')
  .description('Manage database schema migrations')
  .addCommand(
    new Command('up')
      .description('Apply pending migrations')
      .option('--to <id>', 'Migrate up to a specific migration ID')
      .action((opts) => {
        const db = openDb();
        try {
          const runner = createMigrationRunner(db);
          const targetId = opts.to ? parseInt(opts.to, 10) : undefined;
          const result = runner.migrate(targetId);

          if (result.applied.length === 0 && result.errors.length === 0) {
            console.log(chalk.green('\n✅ Database is up to date — no pending migrations\n'));
            return;
          }

          if (result.applied.length > 0) {
            console.log(chalk.green(`\n✅ Applied ${result.applied.length} migration(s):\n`));
            for (const name of result.applied) {
              console.log(`  ${chalk.gray('↑')} ${name}`);
            }
          }

          if (result.errors.length > 0) {
            console.log(chalk.red(`\n❌ ${result.errors.length} migration(s) failed:\n`));
            for (const { name, error } of result.errors) {
              console.log(`  ${chalk.red('✗')} ${name}: ${error}`);
            }
            process.exit(1);
          }
          console.log();
        } finally {
          db.close();
        }
      })
  )
  .addCommand(
    new Command('down')
      .description('Rollback migrations to a specific point')
      .argument('<target-id>', 'Roll back to this migration ID (0 to rollback all)')
      .action((targetId) => {
        const id = parseInt(targetId, 10);
        if (isNaN(id) || id < 0) {
          console.error(chalk.red('Target ID must be a non-negative integer'));
          process.exit(1);
        }

        const db = openDb();
        try {
          const runner = createMigrationRunner(db);
          const result = runner.rollback(id);

          if (result.applied.length === 0) {
            console.log(chalk.yellow('\nNo migrations to rollback\n'));
            return;
          }

          console.log(chalk.green(`\n✅ Rolled back ${result.applied.length} migration(s):\n`));
          for (const name of result.applied) {
            console.log(`  ${chalk.gray('↓')} ${name}`);
          }

          if (result.errors.length > 0) {
            console.log(chalk.red(`\n❌ ${result.errors.length} rollback(s) failed:\n`));
            for (const { name, error } of result.errors) {
              console.log(`  ${chalk.red('✗')} ${name}: ${error}`);
            }
          }
          console.log();
        } finally {
          db.close();
        }
      })
  )
  .addCommand(
    new Command('status')
      .description('Show migration status')
      .action(() => {
        const db = openDb();
        try {
          const runner = createMigrationRunner(db);
          const status = runner.getStatus();

          console.log(chalk.cyan('\nMigration Status:\n'));
          console.log(`  Current version: ${status.current || chalk.gray('(none)')}`);
          console.log(`  Applied:         ${status.applied.length}`);
          console.log(`  Pending:         ${status.pending.length}`);
          console.log(`  Total available: ${MIGRATIONS.length}\n`);

          if (status.applied.length > 0) {
            console.log(chalk.gray('  Applied:'));
            for (const m of status.applied) {
              const date = new Date(m.applied_at * 1000).toLocaleString();
              console.log(`    ${chalk.green('✓')} ${m.name} ${chalk.gray(`(${date})`)}`);
            }
          }

          if (status.pending.length > 0) {
            console.log(chalk.gray('  Pending:'));
            for (const m of status.pending) {
              console.log(`    ${chalk.yellow('○')} ${m.name}`);
            }
          }
          console.log();
        } finally {
          db.close();
        }
      })
  );
