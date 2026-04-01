/**
 * Prescription Templates
 *
 * Community-contributed improvement playbooks.
 * Load, validate, and register custom playbook templates.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Playbook } from './types.js';

export interface PlaybookTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  playbook: Playbook;
  examples?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TemplateRegistry {
  templates: PlaybookTemplate[];
  categories: Record<string, number>;
  lastUpdated: string;
}

export class PrescriptionTemplates {
  private templatesDir: string;
  private registryFile: string;
  private registry: TemplateRegistry;

  constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
    mkdirSync(templatesDir, { recursive: true });
    this.registryFile = join(templatesDir, 'registry.json');
    this.registry = this.loadRegistry();
  }

  register(template: PlaybookTemplate): TemplateValidation {
    const validation = this.validate(template);
    if (!validation.valid) return validation;

    // Replace existing or add new
    const idx = this.registry.templates.findIndex(t => t.id === template.id);
    if (idx >= 0) {
      this.registry.templates[idx] = template;
    } else {
      this.registry.templates.push(template);
    }

    this.updateCategories();
    this.save();

    // Save template file
    const templatePath = join(this.templatesDir, `${template.id}.json`);
    writeFileSync(templatePath, JSON.stringify(template, null, 2));

    return validation;
  }

  unregister(templateId: string): boolean {
    const idx = this.registry.templates.findIndex(t => t.id === templateId);
    if (idx < 0) return false;

    this.registry.templates.splice(idx, 1);
    this.updateCategories();
    this.save();
    return true;
  }

  get(templateId: string): PlaybookTemplate | null {
    return this.registry.templates.find(t => t.id === templateId) || null;
  }

  list(category?: string): PlaybookTemplate[] {
    if (category) {
      return this.registry.templates.filter(t => t.category === category);
    }
    return [...this.registry.templates];
  }

  search(query: string): PlaybookTemplate[] {
    const q = query.toLowerCase();
    return this.registry.templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q)
    );
  }

  getCategories(): Record<string, number> {
    return { ...this.registry.categories };
  }

  validate(template: PlaybookTemplate): TemplateValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.id || template.id.length === 0) {
      errors.push('Template ID is required');
    }
    if (!template.name || template.name.length === 0) {
      errors.push('Template name is required');
    }
    if (!template.description || template.description.length === 0) {
      errors.push('Template description is required');
    }
    if (!template.author || template.author.length === 0) {
      errors.push('Template author is required');
    }
    if (!template.playbook) {
      errors.push('Template must include a playbook definition');
    } else {
      if (!template.playbook.id) errors.push('Playbook ID is required');
      if (!template.playbook.name) errors.push('Playbook name is required');
      if (!template.playbook.metricCommand) errors.push('Playbook metricCommand is required');
      if (!['higher_is_better', 'lower_is_better'].includes(template.playbook.metricDirection)) {
        errors.push('Playbook metricDirection must be "higher_is_better" or "lower_is_better"');
      }
      if (!template.playbook.constraints || template.playbook.constraints.length === 0) {
        warnings.push('Playbook has no constraints defined — consider adding safety limits');
      }
      if (template.playbook.maxFiles > 10) {
        warnings.push(`Playbook maxFiles (${template.playbook.maxFiles}) is high — consider limiting scope`);
      }
    }

    if (!template.category) {
      warnings.push('No category specified — template will be uncategorized');
    }

    if (!template.tags || template.tags.length === 0) {
      warnings.push('No tags specified — template may be hard to discover');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  importFromFile(filePath: string): TemplateValidation {
    if (!existsSync(filePath)) {
      return { valid: false, errors: [`File not found: ${filePath}`], warnings: [] };
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const template = JSON.parse(content) as PlaybookTemplate;
      return this.register(template);
    } catch (err) {
      return {
        valid: false,
        errors: [`Failed to parse template: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      };
    }
  }

  exportToFile(templateId: string, outputPath: string): boolean {
    const template = this.get(templateId);
    if (!template) return false;

    const dir = join(outputPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(template, null, 2));
    return true;
  }

  private updateCategories(): void {
    this.registry.categories = {};
    for (const t of this.registry.templates) {
      const cat = t.category || 'uncategorized';
      this.registry.categories[cat] = (this.registry.categories[cat] || 0) + 1;
    }
  }

  private loadRegistry(): TemplateRegistry {
    if (existsSync(this.registryFile)) {
      try {
        return JSON.parse(readFileSync(this.registryFile, 'utf-8'));
      } catch { /* fall through */ }
    }
    return { templates: [], categories: {}, lastUpdated: new Date().toISOString() };
  }

  private save(): void {
    this.registry.lastUpdated = new Date().toISOString();
    writeFileSync(this.registryFile, JSON.stringify(this.registry, null, 2));
  }
}

export function createTemplateRegistry(templatesDir: string): PrescriptionTemplates {
  return new PrescriptionTemplates(templatesDir);
}
