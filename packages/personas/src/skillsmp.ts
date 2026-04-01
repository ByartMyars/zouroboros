/**
 * SkillsMP API Client
 *
 * Search and import community skills from the SkillsMP registry.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import type { SkillsMPSkill } from './types.js';

export interface SkillsMPManifest {
  tarball_url: string;
  archive_root: string;
  skills: SkillsMPEntry[];
}

export interface SkillsMPEntry {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  stars: number;
}

export interface SkillSearchOptions {
  query?: string;
  tags?: string[];
  author?: string;
  sortBy?: 'stars' | 'name' | 'recent';
  limit?: number;
}

export interface SkillImportOptions {
  slug: string;
  destDir: string;
  destSlug?: string;
  force?: boolean;
}

export interface SkillImportResult {
  success: boolean;
  slug: string;
  destPath: string;
  error?: string;
}

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/zocomputer/skills/main/manifest.json';

export class SkillsMPClient {
  private manifestUrl: string;
  private cachedManifest: SkillsMPManifest | null = null;
  private cacheExpiry: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(manifestUrl?: string) {
    this.manifestUrl = manifestUrl || DEFAULT_MANIFEST_URL;
  }

  async fetchManifest(forceRefresh = false): Promise<SkillsMPManifest> {
    if (!forceRefresh && this.cachedManifest && Date.now() < this.cacheExpiry) {
      return this.cachedManifest;
    }

    const response = await fetch(this.manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json() as Record<string, unknown>;
    const manifest: SkillsMPManifest = {
      tarball_url: (raw.tarball_url as string) || '',
      archive_root: (raw.archive_root as string) || '',
      skills: Array.isArray(raw.skills) ? (raw.skills as SkillsMPEntry[]) : [],
    };

    this.cachedManifest = manifest;
    this.cacheExpiry = Date.now() + this.cacheTTL;
    return manifest;
  }

  async search(options: SkillSearchOptions = {}): Promise<SkillsMPEntry[]> {
    const manifest = await this.fetchManifest();
    let results = [...manifest.skills];

    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    if (options.tags?.length) {
      const tags = options.tags.map(t => t.toLowerCase());
      results = results.filter(s =>
        tags.some(t => s.tags.map(st => st.toLowerCase()).includes(t))
      );
    }

    if (options.author) {
      const author = options.author.toLowerCase();
      results = results.filter(s => s.author.toLowerCase().includes(author));
    }

    switch (options.sortBy) {
      case 'stars':
        results.sort((a, b) => b.stars - a.stars);
        break;
      case 'name':
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'recent':
        // Already in order from manifest
        break;
      default:
        // Relevance: query match quality
        if (options.query) {
          const q = options.query.toLowerCase();
          results.sort((a, b) => {
            const aExact = a.slug === q || a.name.toLowerCase() === q ? 10 : 0;
            const bExact = b.slug === q || b.name.toLowerCase() === q ? 10 : 0;
            return (bExact + b.stars) - (aExact + a.stars);
          });
        }
    }

    return results.slice(0, options.limit || 50);
  }

  async getSkill(slug: string): Promise<SkillsMPEntry | null> {
    const manifest = await this.fetchManifest();
    return manifest.skills.find(s => s.slug === slug) || null;
  }

  async importSkill(options: SkillImportOptions): Promise<SkillImportResult> {
    const manifest = await this.fetchManifest();
    const skill = manifest.skills.find(s => s.slug === options.slug);

    if (!skill) {
      return {
        success: false,
        slug: options.slug,
        destPath: '',
        error: `Skill "${options.slug}" not found in registry`,
      };
    }

    const destSlug = options.destSlug || options.slug;
    const destPath = join(options.destDir, destSlug);

    if (existsSync(destPath) && !options.force) {
      return {
        success: false,
        slug: options.slug,
        destPath,
        error: `Destination "${destPath}" already exists. Use force=true to overwrite, or specify a different destSlug.`,
      };
    }

    try {
      mkdirSync(options.destDir, { recursive: true });

      // Download tarball then extract — uses spawnSync with arg arrays to prevent injection
      const { spawnSync } = await import('child_process');
      const { tmpdir } = await import('os');
      const tarballPath = join(tmpdir(), `skillsmp-${Date.now()}.tar.gz`);

      const curlResult = spawnSync('curl', ['-fsSL', '-o', tarballPath, manifest.tarball_url], {
        stdio: 'pipe',
        timeout: 30000,
      });
      if (curlResult.status !== 0) {
        throw new Error(`Download failed: ${curlResult.stderr?.toString() || 'unknown error'}`);
      }

      const tarResult = spawnSync('tar', [
        '-xzf', tarballPath,
        '-C', options.destDir,
        '--strip-components=1',
        `--transform=s|^${manifest.archive_root}/${options.slug}|${destSlug}|`,
        `${manifest.archive_root}/${options.slug}`,
      ], { stdio: 'pipe', timeout: 30000 });

      // Clean up tarball
      try { (await import('fs')).unlinkSync(tarballPath); } catch {}

      if (tarResult.status !== 0) {
        throw new Error(`Extract failed: ${tarResult.stderr?.toString() || 'unknown error'}`);
      }

      return {
        success: true,
        slug: options.slug,
        destPath,
      };
    } catch (err) {
      return {
        success: false,
        slug: options.slug,
        destPath,
        error: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async listInstalled(skillsDir: string): Promise<string[]> {
    if (!existsSync(skillsDir)) return [];

    const { readdirSync, statSync } = await import('fs');
    return readdirSync(skillsDir)
      .filter(name => {
        const path = join(skillsDir, name);
        return statSync(path).isDirectory() && existsSync(join(path, 'SKILL.md'));
      });
  }

  async checkUpdates(skillsDir: string): Promise<Array<{ slug: string; installed: boolean; available: boolean }>> {
    const manifest = await this.fetchManifest();
    const installed = await this.listInstalled(skillsDir);

    return manifest.skills
      .filter(s => installed.includes(s.slug))
      .map(s => ({
        slug: s.slug,
        installed: true,
        available: true,
      }));
  }
}

export function createSkillsMPClient(manifestUrl?: string): SkillsMPClient {
  return new SkillsMPClient(manifestUrl);
}
