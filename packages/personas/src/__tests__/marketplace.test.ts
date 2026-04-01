import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PersonaMarketplace } from '../marketplace';

const TEST_DIR = join(import.meta.dir, '../../.test-marketplace');
const PERSONAS_DIR = join(TEST_DIR, 'personas');
const MARKETPLACE_DIR = join(TEST_DIR, 'marketplace');

function setupPersona(slug: string) {
  const dir = join(PERSONAS_DIR, slug);
  mkdirSync(join(dir, 'IDENTITY'), { recursive: true });

  writeFileSync(join(dir, 'SOUL.md'), `# SOUL.md — TEST Workspace Constitution\n\n### TEST Specifics\n- Rule 1`);
  writeFileSync(join(dir, 'IDENTITY', `${slug}.md`), `# IDENTITY — Test Persona\n\n## Role\nTest persona for unit tests`);
  writeFileSync(join(dir, 'PROMPT.md'), `You are an experienced Test Persona specializing in testing. Your expertise spans unit testing, integration testing, and e2e testing.`);
  writeFileSync(join(dir, 'SAFETY.md'), `# Safety Rules — Test Persona\n\n- Rule 1`);
}

describe('PersonaMarketplace', () => {
  let marketplace: PersonaMarketplace;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(PERSONAS_DIR, { recursive: true });
    mkdirSync(MARKETPLACE_DIR, { recursive: true });
    marketplace = new PersonaMarketplace(PERSONAS_DIR, MARKETPLACE_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('exportPersona', () => {
    test('exports a persona to a package file', async () => {
      setupPersona('test-persona');
      const result = await marketplace.exportPersona('test-persona');

      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('test-persona.persona.json');
      expect(existsSync(result.outputPath)).toBe(true);
      expect(result.package).not.toBeNull();
      expect(result.package!.persona.slug).toBe('test-persona');
      expect(result.package!.checksum).toBeTruthy();
      expect(Object.keys(result.package!.files).length).toBe(4);
    });

    test('returns error for non-existent persona', async () => {
      const result = await marketplace.exportPersona('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('exports to custom output directory', async () => {
      setupPersona('test-persona');
      const customDir = join(TEST_DIR, 'custom-export');
      const result = await marketplace.exportPersona('test-persona', customDir);

      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('custom-export');
    });

    test('extracts config from IDENTITY and SOUL files', async () => {
      setupPersona('test-persona');
      const result = await marketplace.exportPersona('test-persona');

      expect(result.package!.persona.name).toBe('Test Persona');
      expect(result.package!.persona.domain).toBe('test');
      expect(result.package!.persona.description).toContain('Test persona');
    });
  });

  describe('importPersona', () => {
    test('imports a persona from a package file', async () => {
      setupPersona('original');
      const exportResult = await marketplace.exportPersona('original');

      const result = await marketplace.importPersona(exportResult.outputPath, 'imported');

      expect(result.success).toBe(true);
      expect(result.slug).toBe('imported');
      expect(result.filesWritten).toBe(4);
      expect(existsSync(join(PERSONAS_DIR, 'imported', 'SOUL.md'))).toBe(true);
    });

    test('prevents overwrite without force flag', async () => {
      setupPersona('original');
      const exportResult = await marketplace.exportPersona('original');

      const result = await marketplace.importPersona(exportResult.outputPath, 'original');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    test('allows overwrite with force flag', async () => {
      setupPersona('original');
      const exportResult = await marketplace.exportPersona('original');

      const result = await marketplace.importPersona(exportResult.outputPath, 'original', true);
      expect(result.success).toBe(true);
    });

    test('returns error for non-existent package', async () => {
      const result = await marketplace.importPersona('/nonexistent.json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('detects corrupted package via checksum', async () => {
      setupPersona('original');
      const exportResult = await marketplace.exportPersona('original');

      // Corrupt the package
      const content = JSON.parse(readFileSync(exportResult.outputPath, 'utf-8'));
      content.persona.name = 'Tampered';
      writeFileSync(exportResult.outputPath, JSON.stringify(content));

      const result = await marketplace.importPersona(exportResult.outputPath, 'corrupted');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Checksum mismatch');
    });
  });

  describe('listExported', () => {
    test('lists exported persona packages', async () => {
      setupPersona('persona-a');
      setupPersona('persona-b');
      await marketplace.exportPersona('persona-a');
      await marketplace.exportPersona('persona-b');

      const listings = await marketplace.listExported();
      expect(listings.length).toBe(2);
      expect(listings.map(l => l.slug).sort()).toEqual(['persona-a', 'persona-b']);
    });

    test('returns empty for no exports', async () => {
      const listings = await marketplace.listExported();
      expect(listings.length).toBe(0);
    });
  });

  describe('listInstalled', () => {
    test('lists installed personas', async () => {
      setupPersona('alpha');
      setupPersona('beta');

      const listings = await marketplace.listInstalled();
      expect(listings.length).toBe(2);
      expect(listings.map(l => l.slug).sort()).toEqual(['alpha', 'beta']);
    });
  });
});
