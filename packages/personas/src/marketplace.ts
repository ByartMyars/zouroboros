/**
 * Persona Marketplace
 *
 * Share, export, and import persona configurations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { PersonaConfig, IdentityTemplate, SafetyRule } from './types.js';

export interface PersonaPackage {
  version: string;
  exportedAt: string;
  persona: PersonaConfig;
  files: Record<string, string>;
  checksum: string;
}

export interface PersonaListing {
  slug: string;
  name: string;
  domain: string;
  description: string;
  expertise: string[];
  exportedAt: string;
  fileCount: number;
}

export interface ImportResult {
  success: boolean;
  slug: string;
  destPath: string;
  filesWritten: number;
  error?: string;
}

export interface ExportResult {
  success: boolean;
  slug: string;
  outputPath: string;
  package: PersonaPackage | null;
  error?: string;
}

function computeChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export class PersonaMarketplace {
  private personasDir: string;
  private marketplaceDir: string;

  constructor(personasDir: string, marketplaceDir?: string) {
    this.personasDir = personasDir;
    this.marketplaceDir = marketplaceDir || join(personasDir, '..', 'marketplace');
  }

  async exportPersona(slug: string, outputDir?: string): Promise<ExportResult> {
    const personaDir = join(this.personasDir, slug);

    if (!existsSync(personaDir)) {
      return {
        success: false,
        slug,
        outputPath: '',
        package: null,
        error: `Persona directory not found: ${personaDir}`,
      };
    }

    const files: Record<string, string> = {};
    this.collectFiles(personaDir, personaDir, files);

    // Try to read persona config from files
    let config: PersonaConfig;
    try {
      config = this.extractConfigFromFiles(slug, files);
    } catch (err) {
      return {
        success: false,
        slug,
        outputPath: '',
        package: null,
        error: `Failed to extract config: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const pkg: PersonaPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      persona: config,
      files,
      checksum: '',
    };

    pkg.checksum = computeChecksum(JSON.stringify({ persona: pkg.persona, files: pkg.files }));

    const destDir = outputDir || this.marketplaceDir;
    mkdirSync(destDir, { recursive: true });
    const outputPath = join(destDir, `${slug}.persona.json`);
    writeFileSync(outputPath, JSON.stringify(pkg, null, 2));

    return {
      success: true,
      slug,
      outputPath,
      package: pkg,
    };
  }

  async importPersona(packagePath: string, destSlug?: string, force = false): Promise<ImportResult> {
    if (!existsSync(packagePath)) {
      return {
        success: false,
        slug: '',
        destPath: '',
        filesWritten: 0,
        error: `Package file not found: ${packagePath}`,
      };
    }

    let pkg: PersonaPackage;
    try {
      const content = readFileSync(packagePath, 'utf-8');
      pkg = JSON.parse(content) as PersonaPackage;
    } catch (err) {
      return {
        success: false,
        slug: '',
        destPath: '',
        filesWritten: 0,
        error: `Failed to parse package: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Verify checksum
    const expectedChecksum = computeChecksum(JSON.stringify({ persona: pkg.persona, files: pkg.files }));
    if (pkg.checksum && pkg.checksum !== expectedChecksum) {
      return {
        success: false,
        slug: pkg.persona.slug,
        destPath: '',
        filesWritten: 0,
        error: 'Checksum mismatch — package may be corrupted',
      };
    }

    const slug = destSlug || pkg.persona.slug;
    const destPath = join(this.personasDir, slug);

    if (existsSync(destPath) && !force) {
      return {
        success: false,
        slug,
        destPath,
        filesWritten: 0,
        error: `Destination "${destPath}" already exists. Use force=true to overwrite.`,
      };
    }

    mkdirSync(destPath, { recursive: true });

    let filesWritten = 0;
    for (const [relativePath, content] of Object.entries(pkg.files)) {
      const fullPath = join(destPath, relativePath);
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content);
      filesWritten++;
    }

    return {
      success: true,
      slug,
      destPath,
      filesWritten,
    };
  }

  async listExported(): Promise<PersonaListing[]> {
    if (!existsSync(this.marketplaceDir)) return [];

    return readdirSync(this.marketplaceDir)
      .filter(f => f.endsWith('.persona.json'))
      .map(f => {
        try {
          const content = readFileSync(join(this.marketplaceDir, f), 'utf-8');
          const pkg = JSON.parse(content) as PersonaPackage;
          return {
            slug: pkg.persona.slug,
            name: pkg.persona.name,
            domain: pkg.persona.domain,
            description: pkg.persona.description,
            expertise: pkg.persona.expertise,
            exportedAt: pkg.exportedAt,
            fileCount: Object.keys(pkg.files).length,
          };
        } catch {
          return null;
        }
      })
      .filter((l): l is PersonaListing => l !== null);
  }

  async listInstalled(): Promise<PersonaListing[]> {
    if (!existsSync(this.personasDir)) return [];

    return readdirSync(this.personasDir)
      .filter(name => {
        const path = join(this.personasDir, name);
        return statSync(path).isDirectory();
      })
      .map(slug => {
        const personaDir = join(this.personasDir, slug);
        const files: Record<string, string> = {};
        this.collectFiles(personaDir, personaDir, files);

        try {
          const config = this.extractConfigFromFiles(slug, files);
          return {
            slug,
            name: config.name,
            domain: config.domain,
            description: config.description,
            expertise: config.expertise,
            exportedAt: '',
            fileCount: Object.keys(files).length,
          };
        } catch {
          return {
            slug,
            name: slug,
            domain: 'unknown',
            description: '',
            expertise: [],
            exportedAt: '',
            fileCount: Object.keys(files).length,
          };
        }
      });
  }

  private collectFiles(dir: string, baseDir: string, files: Record<string, string>): void {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const relativePath = fullPath.slice(baseDir.length + 1);

      if (statSync(fullPath).isDirectory()) {
        this.collectFiles(fullPath, baseDir, files);
      } else {
        try {
          files[relativePath] = readFileSync(fullPath, 'utf-8');
        } catch {
          // Skip binary files
        }
      }
    }
  }

  private extractConfigFromFiles(slug: string, files: Record<string, string>): PersonaConfig {
    // Try to find config from IDENTITY or SOUL files
    const identityKey = Object.keys(files).find(k => k.includes('IDENTITY') && k.endsWith('.md'));
    const soulKey = Object.keys(files).find(k => k === 'SOUL.md');
    const promptKey = Object.keys(files).find(k => k === 'PROMPT.md');

    let name = slug;
    let domain = 'general';
    let description = '';
    const expertise: string[] = [];
    const capabilities: string[] = [];
    const safetyRules: string[] = [];

    if (identityKey) {
      const content = files[identityKey];
      const nameMatch = content.match(/^# IDENTITY — (.+)$/m);
      if (nameMatch) name = nameMatch[1];

      const roleMatch = content.match(/## Role\n(.+)/);
      if (roleMatch) description = roleMatch[1];
    }

    if (soulKey) {
      const content = files[soulKey];
      const domainMatch = content.match(/### (.+?) Specifics/);
      if (domainMatch) domain = domainMatch[1].toLowerCase();
    }

    if (promptKey) {
      const content = files[promptKey];
      const expertiseMatch = content.match(/expertise spans (.+?)\./);
      if (expertiseMatch) {
        expertise.push(...expertiseMatch[1].split(/,\s*and\s*|,\s*/));
      }
    }

    return {
      name,
      slug,
      domain,
      description: description || `${name} persona`,
      expertise: expertise.length ? expertise : ['General'],
      requiresApiKey: false,
      safetyRules: safetyRules.length ? safetyRules : ['Standard safety rules apply'],
      capabilities: capabilities.length ? capabilities : ['General assistance'],
    };
  }
}

export function createMarketplace(personasDir: string, marketplaceDir?: string): PersonaMarketplace {
  return new PersonaMarketplace(personasDir, marketplaceDir);
}
