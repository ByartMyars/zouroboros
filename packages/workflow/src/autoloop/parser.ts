/**
 * Parse program.md files for autoloop
 */

import { readFileSync } from 'fs';
import type { ProgramConfig, MetricConfig, ConstraintConfig, StagnationConfig } from './types.js';

/**
 * Extract a section from markdown by heading
 */
function getSection(content: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const match = content.match(re);
  if (!match || match.index === undefined) return '';
  
  const start = match.index + match[0].length;
  const nextHeading = content.slice(start).search(/^##\s+/m);
  const end = nextHeading === -1 ? content.length : start + nextHeading;
  
  return content.slice(start, end).trim();
}

/**
 * Extract a field from a section
 */
function getField(section: string, field: string): string {
  const re = new RegExp(`^-\\s+\\*\\*${field}\\*\\*:\\s*(.+)$`, 'im');
  const match = section.match(re);
  return match ? match[1].trim() : '';
}

/**
 * Parse a number from constraint text
 */
function parseConstraint(content: string, label: string, fallback: number): number {
  const re = new RegExp(`\\*\\*${label}\\*\\*:\\s*([\\d.]+)`, 'i');
  const m = content.match(re);
  return m ? parseFloat(m[1]) : fallback;
}

/**
 * Parse a stagnation threshold
 */
function parseStagnation(content: string, label: string, fallback: number): number {
  const re = new RegExp(`\\*\\*${label}\\*\\*:\\s*(\\d+)`, 'i');
  const m = content.match(re);
  return m ? parseInt(m[1]) : fallback;
}

/**
 * Parse a program.md file into configuration
 */
export function parseProgram(path: string): ProgramConfig {
  const raw = readFileSync(path, 'utf-8');
  
  // Extract name from title
  const nameMatch = raw.match(/^#\s+Program:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : 'unnamed';
  
  // Extract metric section
  const metricSection = getSection(raw, 'Metric');
  const metricName = getField(metricSection, 'name');
  const direction = getField(metricSection, 'direction') as 'lower_is_better' | 'higher_is_better';
  const extract = getField(metricSection, 'extract').replace(/^`|`$/g, '');
  
  // Extract constraints
  const constraintsSection = getSection(raw, 'Constraints');
  
  // Extract stagnation config
  const stagnationSection = getSection(raw, 'Stagnation');
  
  // Extract read-only files
  const readOnlySection = getSection(raw, 'Read-Only Files');
  const readOnlyFiles = readOnlySection
    .split('\n')
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  
  // Extract setup code
  const setupSection = getSection(raw, 'Setup');
  const setupMatch = setupSection.match(/```(?:bash)?\n([\s\S]*?)```/);
  
  // Extract run command
  const runSection = getSection(raw, 'Run Command');
  const runMatch = runSection.match(/```(?:bash)?\n([\s\S]*?)```/);
  
  // Extract target file
  const targetSection = getSection(raw, 'Target File');
  const targetFile = targetSection.split('\n')[0].replace(/^`|`$/g, '').trim();
  
  return {
    name,
    objective: getSection(raw, 'Objective'),
    metric: {
      name: metricName,
      direction: direction || 'lower_is_better',
      extract
    },
    setup: setupMatch ? setupMatch[1].trim() : setupSection,
    targetFile,
    runCommand: runMatch ? runMatch[1].trim() : runSection.split('\n')[0],
    readOnlyFiles,
    constraints: {
      timeBudgetSeconds: parseConstraint(constraintsSection, 'Time budget per run', 300),
      maxExperiments: parseConstraint(constraintsSection, 'Max experiments', 100),
      maxDurationHours: parseConstraint(constraintsSection, 'Max duration', 8),
      maxCostUSD: parseConstraint(constraintsSection, 'Max cost', 10)
    },
    stagnation: {
      threshold: parseStagnation(stagnationSection, 'Threshold', 10),
      doubleThreshold: parseStagnation(stagnationSection, 'Double threshold', 20),
      tripleThreshold: parseStagnation(stagnationSection, 'Triple threshold', 30)
    },
    notes: getSection(raw, 'Notes')
  };
}

/**
 * Validate a program configuration
 */
export function validateProgram(config: ProgramConfig): string[] {
  const errors: string[] = [];
  
  if (!config.name || config.name === 'unnamed') {
    errors.push('Program must have a name');
  }
  
  if (!config.metric.name) {
    errors.push('Metric must have a name');
  }
  
  if (!config.metric.extract) {
    errors.push('Metric must have an extract command/pattern');
  }
  
  if (!config.targetFile) {
    errors.push('Target file must be specified');
  }
  
  if (!config.runCommand) {
    errors.push('Run command must be specified');
  }
  
  return errors;
}
