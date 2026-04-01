import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  createBackup,
  restoreBackup,
  listBackups,
  pruneBackups,
  formatBytes,
} from 'zouroboros-core';

export const backupCommand = new Command('backup')
  .description('Backup and restore Zouroboros data')
  .addCommand(
    new Command('create')
      .description('Create a new backup of memory DB, config, and registry')
      .option('-l, --label <label>', 'Optional label for the backup')
      .action((opts) => {
        try {
          const config = loadConfig();
          const result = createBackup({ config, label: opts.label });

          console.log(chalk.green('\n✅ Backup created successfully\n'));
          console.log(`  Location: ${chalk.cyan(result.backupDir)}`);
          console.log(`  Files:    ${result.manifest.files.length}`);
          console.log(`  Size:     ${formatBytes(result.totalSizeBytes)}`);
          console.log();

          for (const file of result.manifest.files) {
            console.log(`  ${chalk.gray('•')} ${file.name} (${formatBytes(file.sizeBytes)})`);
          }

          // Auto-prune old backups
          const pruned = pruneBackups(config);
          if (pruned > 0) {
            console.log(chalk.gray(`\n  Pruned ${pruned} old backup(s)`));
          }
          console.log();
        } catch (err) {
          console.error(chalk.red(`\n❌ Backup failed: ${err instanceof Error ? err.message : String(err)}\n`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('restore')
      .description('Restore from a backup')
      .argument('<name>', 'Backup name or path (use "backup list" to see available)')
      .option('--dry-run', 'Show what would be restored without making changes')
      .option('--skip-config', 'Skip restoring the config file')
      .action((name, opts) => {
        try {
          const config = loadConfig();
          const backups = listBackups(config);

          // Resolve backup path: check if it's a name or full path
          let backupDir = name;
          const match = backups.find((b) => b.name === name);
          if (match) {
            backupDir = match.path;
          }

          if (opts.dryRun) {
            console.log(chalk.yellow('\n🔍 Dry run — no changes will be made\n'));
          }

          const result = restoreBackup(backupDir, {
            dryRun: opts.dryRun,
            skipConfig: opts.skipConfig,
          });

          const verb = opts.dryRun ? 'Would restore' : 'Restored';
          console.log(chalk.green(`\n✅ ${verb} from backup (${result.manifest.createdAt})\n`));

          if (result.restoredFiles.length > 0) {
            console.log(`  ${chalk.cyan(verb)}:`);
            for (const f of result.restoredFiles) {
              console.log(`    ${chalk.gray('•')} ${f}`);
            }
          }

          if (result.skippedFiles.length > 0) {
            console.log(`\n  ${chalk.yellow('Skipped')}:`);
            for (const f of result.skippedFiles) {
              console.log(`    ${chalk.gray('•')} ${f}`);
            }
          }
          console.log();
        } catch (err) {
          console.error(chalk.red(`\n❌ Restore failed: ${err instanceof Error ? err.message : String(err)}\n`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List available backups')
      .alias('ls')
      .action(() => {
        try {
          const config = loadConfig();
          const backups = listBackups(config);

          if (backups.length === 0) {
            console.log(chalk.yellow('\nNo backups found. Run "zouroboros backup create" to create one.\n'));
            return;
          }

          console.log(chalk.cyan(`\nAvailable backups (${backups.length}):\n`));

          for (const backup of backups) {
            const date = new Date(backup.createdAt).toLocaleString();
            console.log(
              `  ${chalk.white(backup.name)}  ${chalk.gray(date)}  ${chalk.gray(formatBytes(backup.sizeBytes))}  ${chalk.gray(`${backup.fileCount} files`)}`
            );
          }
          console.log();
        } catch (err) {
          console.error(chalk.red(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('prune')
      .description('Remove old backups, keeping the most recent N')
      .option('-k, --keep <count>', 'Number of backups to keep', '10')
      .action((opts) => {
        try {
          const config = loadConfig();
          const keep = parseInt(opts.keep, 10);
          if (isNaN(keep) || keep < 1) {
            console.error(chalk.red('--keep must be a positive number'));
            process.exit(1);
          }
          const pruned = pruneBackups(config, keep);
          if (pruned === 0) {
            console.log(chalk.gray(`\nNo backups to prune (${listBackups(config).length} ≤ ${keep})\n`));
          } else {
            console.log(chalk.green(`\n✅ Pruned ${pruned} old backup(s), kept ${keep}\n`));
          }
        } catch (err) {
          console.error(chalk.red(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`));
          process.exit(1);
        }
      })
  );
