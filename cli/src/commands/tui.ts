import { Command } from 'commander';
import { spawn } from 'child_process';
import { join } from 'path';

export const tuiCommand = new Command('tui')
  .description('Launch Terminal User Interface dashboard')
  .action(() => {
    // Launch the TUI from the separate tui package
    spawn('bun', [join(__dirname, '../../../tui/src/index.ts')], {
      stdio: 'inherit'
    });
  });