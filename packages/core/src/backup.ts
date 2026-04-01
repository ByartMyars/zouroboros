/**
 * Backup and restore utilities for Zouroboros
 *
 * Handles creating timestamped backups of the memory database and config,
 * and restoring from backup archives.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import type { ZouroborosConfig } from './types.js';
import { DEFAULT_CONFIG_PATH, DEFAULT_DATA_DIR } from './constants.js';
import { loadConfig, validateConfig } from './config/loader.js';

export interface BackupManifest {
  version: string;
  createdAt: string;
  hostname: string;
  files: BackupFile[];
}

export interface BackupFile {
  name: string;
  originalPath: string;
  sizeBytes: number;
}

export interface BackupResult {
  backupDir: string;
  manifest: BackupManifest;
  totalSizeBytes: number;
}

export interface RestoreResult {
  restoredFiles: string[];
  skippedFiles: string[];
  manifest: BackupManifest;
}

const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 10;

/**
 * Get the backup root directory
 */
export function getBackupDir(config?: ZouroborosConfig): string {
  const dataDir = config?.core.dataDir ?? DEFAULT_DATA_DIR;
  return join(dataDir, BACKUP_DIR_NAME);
}

/**
 * Create a timestamped backup of the memory database and configuration.
 */
export function createBackup(options: {
  config?: ZouroborosConfig;
  configPath?: string;
  label?: string;
} = {}): BackupResult {
  const config = options.config ?? loadConfig(options.configPath);
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = options.label ? `-${options.label}` : '';
  const backupName = `backup-${timestamp}${label}`;
  const backupRoot = getBackupDir(config);
  const backupDir = join(backupRoot, backupName);

  mkdirSync(backupDir, { recursive: true });

  const files: BackupFile[] = [];

  // Backup memory database
  if (existsSync(config.memory.dbPath)) {
    const dest = join(backupDir, 'memory.db');
    copyFileSync(config.memory.dbPath, dest);
    const stat = statSync(dest);
    files.push({
      name: 'memory.db',
      originalPath: config.memory.dbPath,
      sizeBytes: stat.size,
    });

    // Also back up WAL/SHM if they exist
    for (const suffix of ['-wal', '-shm']) {
      const walPath = config.memory.dbPath + suffix;
      if (existsSync(walPath)) {
        const walDest = join(backupDir, `memory.db${suffix}`);
        copyFileSync(walPath, walDest);
        const walStat = statSync(walDest);
        files.push({
          name: `memory.db${suffix}`,
          originalPath: walPath,
          sizeBytes: walStat.size,
        });
      }
    }
  }

  // Backup config file
  if (existsSync(configPath)) {
    const dest = join(backupDir, 'config.json');
    copyFileSync(configPath, dest);
    const stat = statSync(dest);
    files.push({
      name: 'config.json',
      originalPath: configPath,
      sizeBytes: stat.size,
    });
  }

  // Backup executor registry
  if (existsSync(config.swarm.registryPath)) {
    const dest = join(backupDir, 'executor-registry.json');
    copyFileSync(config.swarm.registryPath, dest);
    const stat = statSync(dest);
    files.push({
      name: 'executor-registry.json',
      originalPath: config.swarm.registryPath,
      sizeBytes: stat.size,
    });
  }

  const manifest: BackupManifest = {
    version: config.version,
    createdAt: new Date().toISOString(),
    hostname: process.env.HOSTNAME ?? 'unknown',
    files,
  };

  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return { backupDir, manifest, totalSizeBytes };
}

/**
 * Restore from a backup directory.
 */
export function restoreBackup(backupDir: string, options: {
  dryRun?: boolean;
  skipConfig?: boolean;
} = {}): RestoreResult {
  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${backupDir}. Not a valid backup.`);
  }

  const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const restoredFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const file of manifest.files) {
    const sourcePath = join(backupDir, file.name);

    if (!existsSync(sourcePath)) {
      skippedFiles.push(`${file.name} (missing from backup)`);
      continue;
    }

    if (options.skipConfig && file.name === 'config.json') {
      skippedFiles.push(`${file.name} (--skip-config)`);
      continue;
    }

    // Validate config before restoring it
    if (file.name === 'config.json') {
      try {
        const content = readFileSync(sourcePath, 'utf-8');
        const parsed = JSON.parse(content);
        validateConfig(parsed);
      } catch (err) {
        skippedFiles.push(`${file.name} (validation failed: ${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
    }

    if (!options.dryRun) {
      const destDir = dirname(file.originalPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      copyFileSync(sourcePath, file.originalPath);
    }

    restoredFiles.push(file.originalPath);
  }

  return { restoredFiles, skippedFiles, manifest };
}

/**
 * List all available backups, sorted newest first.
 */
export function listBackups(config?: ZouroborosConfig): {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  fileCount: number;
}[] {
  const backupRoot = getBackupDir(config);
  if (!existsSync(backupRoot)) return [];

  const entries = readdirSync(backupRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('backup-'));

  return entries
    .map((entry) => {
      const dir = join(backupRoot, entry.name);
      const manifestPath = join(dir, 'manifest.json');

      if (!existsSync(manifestPath)) {
        return null;
      }

      try {
        const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const totalSize = manifest.files.reduce((s, f) => s + f.sizeBytes, 0);
        return {
          name: entry.name,
          path: dir,
          createdAt: manifest.createdAt,
          sizeBytes: totalSize,
          fileCount: manifest.files.length,
        };
      } catch {
        return null;
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Prune old backups, keeping only the most recent `keep` backups.
 */
export function pruneBackups(config?: ZouroborosConfig, keep: number = MAX_BACKUPS): number {
  const backups = listBackups(config);
  let pruned = 0;

  if (backups.length <= keep) return 0;

  const toRemove = backups.slice(keep);
  for (const backup of toRemove) {
    const files = readdirSync(backup.path);
    for (const file of files) {
      unlinkSync(join(backup.path, file));
    }
    // Remove empty directory
    try {
      const { rmdirSync } = require('fs');
      rmdirSync(backup.path);
    } catch {
      // Directory may not be empty if nested; acceptable
    }
    pruned++;
  }

  return pruned;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
