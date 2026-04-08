/**
 * Persona Seeder — imports agency personas into the RoleRegistry.
 *
 * Reads agency-agents-personas.json, maps each persona to an executor
 * based on its domain category, and populates the RoleRegistry.
 */

import { readFileSync, existsSync } from 'fs';
import type { RoleRegistry, Role } from './registry.js';

export interface PersonaEntry {
  name: string;
  abspath: string;
}

export interface PersonaSeedOptions {
  personasPath?: string;
  overwrite?: boolean;
}

const DEFAULT_PERSONAS_PATH = '/home/workspace/agency-agents-personas.json';

const CATEGORY_EXECUTOR_MAP: Record<string, { executorId: string; model: string | null }> = {
  engineering: { executorId: 'claude-code', model: 'sonnet' },
  design: { executorId: 'gemini', model: 'pro' },
  marketing: { executorId: 'hermes', model: null },
  product: { executorId: 'claude-code', model: 'sonnet' },
  'project-management': { executorId: 'claude-code', model: 'sonnet' },
  'spatial-computing': { executorId: 'claude-code', model: 'opus' },
  specialized: { executorId: 'claude-code', model: 'sonnet' },
  support: { executorId: 'hermes', model: null },
  testing: { executorId: 'codex', model: null },
};

export function inferCategoryFromPath(abspath: string): string {
  const match = abspath.match(/agency-agents\/([^/]+)\//);
  return match ? match[1] : 'specialized';
}

export function mapCategoryToExecutor(category: string): { executorId: string; model: string | null } {
  return CATEGORY_EXECUTOR_MAP[category] ?? { executorId: 'claude-code', model: 'sonnet' };
}

export function personaNameToRoleId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function seedPersonasToRegistry(
  registry: RoleRegistry,
  options: PersonaSeedOptions = {},
): { added: number; skipped: number; roles: Array<{ id: string; name: string; executorId: string }> } {
  const personasPath = options.personasPath ?? DEFAULT_PERSONAS_PATH;

  if (!existsSync(personasPath)) {
    throw new Error(`Personas file not found: ${personasPath}`);
  }

  const personas: PersonaEntry[] = JSON.parse(readFileSync(personasPath, 'utf-8'));
  let added = 0;
  let skipped = 0;
  const roles: Array<{ id: string; name: string; executorId: string }> = [];

  for (const persona of personas) {
    const category = inferCategoryFromPath(persona.abspath);
    const { executorId, model } = mapCategoryToExecutor(category);
    const roleId = personaNameToRoleId(persona.name);

    const existing = registry.get(roleId);
    if (existing && !options.overwrite) {
      skipped++;
      continue;
    }

    if (existing && options.overwrite) {
      registry.update(roleId, {
        name: persona.name,
        executorId,
        model,
        tags: [category, ...persona.name.toLowerCase().split(/\s+/)],
        description: `${persona.name} persona from ${category} agency`,
      });
    } else {
      registry.create({
        id: roleId,
        name: persona.name,
        executorId,
        model,
        tags: [category, ...persona.name.toLowerCase().split(/\s+/)],
        description: `${persona.name} persona from ${category} agency`,
      });
    }

    added++;
    roles.push({ id: roleId, name: persona.name, executorId });
  }

  return { added, skipped, roles };
}
