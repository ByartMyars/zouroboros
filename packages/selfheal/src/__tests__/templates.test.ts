import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrescriptionTemplates } from '../templates';
import type { PlaybookTemplate } from '../templates';

const TEST_DIR = join(import.meta.dir, '../../.test-templates');

function makeTemplate(id: string, overrides: Partial<PlaybookTemplate> = {}): PlaybookTemplate {
  return {
    id,
    name: `Template ${id}`,
    description: `Description for ${id}`,
    author: 'test-author',
    version: '1.0.0',
    category: 'memory',
    tags: ['test', 'memory'],
    playbook: {
      id: `pb-${id}`,
      name: `Playbook ${id}`,
      description: `Playbook for ${id}`,
      targetFile: null,
      metricCommand: 'echo 0.85',
      metricDirection: 'higher_is_better',
      constraints: ['Constraint 1'],
      maxFiles: 1,
      requiresApproval: false,
    },
    examples: ['Example usage'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PrescriptionTemplates', () => {
  let templates: PrescriptionTemplates;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    templates = new PrescriptionTemplates(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('register', () => {
    test('registers a valid template', () => {
      const result = templates.register(makeTemplate('t1'));
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('rejects template without ID', () => {
      const result = templates.register(makeTemplate('', { id: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ID'))).toBe(true);
    });

    test('rejects template without playbook', () => {
      const t = makeTemplate('t1');
      (t as any).playbook = null;
      const result = templates.register(t);
      expect(result.valid).toBe(false);
    });

    test('replaces existing template with same ID', () => {
      templates.register(makeTemplate('t1', { name: 'Original' }));
      templates.register(makeTemplate('t1', { name: 'Updated' }));

      const t = templates.get('t1');
      expect(t!.name).toBe('Updated');
    });

    test('returns warnings for missing constraints', () => {
      const t = makeTemplate('t1');
      t.playbook.constraints = [];
      const result = templates.register(t);
      expect(result.warnings.some(w => w.includes('constraints'))).toBe(true);
    });
  });

  describe('unregister', () => {
    test('removes a registered template', () => {
      templates.register(makeTemplate('t1'));
      expect(templates.unregister('t1')).toBe(true);
      expect(templates.get('t1')).toBeNull();
    });

    test('returns false for non-existent template', () => {
      expect(templates.unregister('nonexistent')).toBe(false);
    });
  });

  describe('get', () => {
    test('returns template by ID', () => {
      templates.register(makeTemplate('t1'));
      const t = templates.get('t1');
      expect(t).not.toBeNull();
      expect(t!.id).toBe('t1');
    });

    test('returns null for unknown ID', () => {
      expect(templates.get('nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    test('lists all templates', () => {
      templates.register(makeTemplate('t1', { category: 'memory' }));
      templates.register(makeTemplate('t2', { category: 'routing' }));
      expect(templates.list().length).toBe(2);
    });

    test('filters by category', () => {
      templates.register(makeTemplate('t1', { category: 'memory' }));
      templates.register(makeTemplate('t2', { category: 'routing' }));

      expect(templates.list('memory').length).toBe(1);
      expect(templates.list('memory')[0].id).toBe('t1');
    });
  });

  describe('search', () => {
    test('searches by name', () => {
      templates.register(makeTemplate('recall-fix', { name: 'Memory Recall Fix' }));
      templates.register(makeTemplate('routing-fix', { name: 'Routing Fix' }));

      const results = templates.search('recall');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('recall-fix');
    });

    test('searches by tags', () => {
      templates.register(makeTemplate('t1', { tags: ['graph', 'connectivity'] }));
      templates.register(makeTemplate('t2', { tags: ['memory'] }));

      const results = templates.search('graph');
      expect(results.length).toBe(1);
    });
  });

  describe('getCategories', () => {
    test('returns category counts', () => {
      templates.register(makeTemplate('t1', { category: 'memory' }));
      templates.register(makeTemplate('t2', { category: 'memory' }));
      templates.register(makeTemplate('t3', { category: 'routing' }));

      const cats = templates.getCategories();
      expect(cats['memory']).toBe(2);
      expect(cats['routing']).toBe(1);
    });
  });

  describe('importFromFile', () => {
    test('imports template from JSON file', () => {
      const filePath = join(TEST_DIR, 'import-test.json');
      writeFileSync(filePath, JSON.stringify(makeTemplate('imported')));

      const result = templates.importFromFile(filePath);
      expect(result.valid).toBe(true);
      expect(templates.get('imported')).not.toBeNull();
    });

    test('fails for non-existent file', () => {
      const result = templates.importFromFile('/nonexistent.json');
      expect(result.valid).toBe(false);
    });
  });

  describe('exportToFile', () => {
    test('exports template to JSON file', () => {
      templates.register(makeTemplate('t1'));
      const outputPath = join(TEST_DIR, 'export', 't1.json');

      expect(templates.exportToFile('t1', outputPath)).toBe(true);
    });

    test('returns false for non-existent template', () => {
      expect(templates.exportToFile('nonexistent', '/tmp/test.json')).toBe(false);
    });
  });

  describe('persistence', () => {
    test('persists across instances', () => {
      templates.register(makeTemplate('t1'));

      const templates2 = new PrescriptionTemplates(TEST_DIR);
      expect(templates2.get('t1')).not.toBeNull();
    });
  });
});
