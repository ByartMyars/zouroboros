/**
 * Seed specification generator
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import type { SeedSpecification } from './types.js';

/**
 * Generate a seed specification from interview notes
 */
export function generateSeed(
  topic: string,
  notesPath?: string,
  interviewNotes?: string
): SeedSpecification {
  const id = `seed-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  let notes = interviewNotes || '';
  if (notesPath && existsSync(notesPath)) {
    notes = readFileSync(notesPath, 'utf-8');
  }

  // Extract information from notes if available
  const constraints = extractConstraints(notes);
  const acceptanceCriteria = extractAcceptanceCriteria(notes);

  return {
    id,
    created: now,
    status: 'draft',
    goal: topic || 'TODO: Define the primary objective',
    constraints: constraints.length > 0 ? constraints : ['TODO: Add hard constraints from interview'],
    acceptanceCriteria: acceptanceCriteria.length > 0
      ? acceptanceCriteria
      : ['TODO: Add measurable success criteria'],
    ontology: {
      name: 'TODO',
      description: 'TODO: Describe the domain model',
      fields: [
        { name: 'id', type: 'string', description: 'Unique identifier' },
      ],
    },
    evaluationPrinciples: [
      { name: 'correctness', description: 'Does it do what was asked?', weight: 0.4 },
      { name: 'completeness', description: 'Are all acceptance criteria met?', weight: 0.3 },
      { name: 'quality', description: 'Is the implementation sound?', weight: 0.3 },
    ],
    exitConditions: [
      { name: 'all_ac_met', description: 'All acceptance criteria satisfied', criteria: 'AC compliance = 100%' },
    ],
  };
}

/**
 * Format seed as YAML string
 */
export function formatSeedYAML(seed: SeedSpecification): string {
  const fieldsYAML = seed.ontology.fields
    .map(f => `    - name: ${f.name}\n      type: ${f.type}\n      description: "${f.description}"`)
    .join('\n');

  const principlesYAML = seed.evaluationPrinciples
    .map(p => `  - name: ${p.name}\n    description: "${p.description}"\n    weight: ${p.weight}`)
    .join('\n');

  const exitYAML = seed.exitConditions
    .map(e => `  - name: ${e.name}\n    description: "${e.description}"\n    criteria: "${e.criteria}"`)
    .join('\n');

  return `# Seed Specification
# Generated: ${seed.created}
# ID: ${seed.id}

id: "${seed.id}"
created: "${seed.created}"
status: ${seed.status}

goal: "${seed.goal}"

constraints:
${seed.constraints.map(c => `  - "${c}"`).join('\n')}

acceptance_criteria:
${seed.acceptanceCriteria.map(ac => `  - "${ac}"`).join('\n')}

ontology:
  name: "${seed.ontology.name}"
  description: "${seed.ontology.description}"
  fields:
${fieldsYAML}

evaluation_principles:
${principlesYAML}

exit_conditions:
${exitYAML}
`;
}

function extractConstraints(notes: string): string[] {
  const constraints: string[] = [];
  const lines = notes.split('\n');
  let inConstraints = false;

  for (const line of lines) {
    if (line.match(/constraint|must|should|limit|restriction/i)) {
      inConstraints = true;
    }
    if (inConstraints && line.trim().startsWith('-')) {
      constraints.push(line.replace(/^-\s*/, '').trim());
    }
    if (line.match(/acceptance|criteria|success/i)) {
      inConstraints = false;
    }
  }

  return constraints;
}

function extractAcceptanceCriteria(notes: string): string[] {
  const criteria: string[] = [];
  const lines = notes.split('\n');
  let inCriteria = false;

  for (const line of lines) {
    if (line.match(/acceptance|criteria|success|should.*when/i)) {
      inCriteria = true;
    }
    if (inCriteria && line.trim().startsWith('-')) {
      criteria.push(line.replace(/^-\s*/, '').trim());
    }
    if (line.match(/evaluation|exit|complete/i)) {
      inCriteria = false;
    }
  }

  return criteria;
}
