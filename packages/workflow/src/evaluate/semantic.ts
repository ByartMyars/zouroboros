/**
 * Stage 2: Semantic evaluation
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { SeedSpec, SemanticResult, SemanticCriterion } from './types.js';

/**
 * Parse a seed specification from YAML content
 */
export function parseSeed(seedPath: string): SeedSpec {
  const content = readFileSync(seedPath, 'utf-8');
  const spec: SeedSpec = {};

  const goalMatch = content.match(/^goal:\s*"?(.+?)"?\s*$/m);
  if (goalMatch) spec.goal = goalMatch[1];

  spec.constraints = [];
  spec.acceptanceCriteria = [];

  const lines = content.split('\n');
  let inConstraints = false;
  let inAC = false;

  for (const line of lines) {
    if (line.match(/^constraints:/)) {
      inConstraints = true;
      inAC = false;
      continue;
    }
    if (line.match(/^acceptance_criteria:/)) {
      inAC = true;
      inConstraints = false;
      continue;
    }
    if (line.match(/^[a-z_]+:/) && !line.startsWith('  ')) {
      inConstraints = false;
      inAC = false;
      continue;
    }

    const itemMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (itemMatch) {
      if (inConstraints) spec.constraints!.push(itemMatch[1]);
      if (inAC) spec.acceptanceCriteria!.push(itemMatch[1]);
    }
  }

  return spec;
}

/**
 * Run semantic evaluation against acceptance criteria
 */
export function runSemanticEvaluation(
  seed: SeedSpec,
  artifactPath: string
): SemanticResult {
  const criteria: SemanticCriterion[] = [];

  for (const ac of seed.acceptanceCriteria || []) {
    const evidence = searchForEvidence(ac, artifactPath);
    criteria.push({
      name: ac,
      met: evidence.found,
      evidence: evidence.details,
    });
  }

  const metCount = criteria.filter((c) => c.met).length;
  const totalCount = criteria.length || 1;
  const acCompliance = metCount / totalCount;

  // Calculate goal alignment (simplified)
  const goalAlignment = calculateGoalAlignment(seed, artifactPath);

  // Calculate drift score
  const driftScore = calculateDrift(seed, artifactPath);

  // Overall score
  const overallScore = 0.5 * goalAlignment + 0.3 * acCompliance + 0.2 * (1 - driftScore);

  return {
    acCompliance,
    goalAlignment,
    driftScore,
    overallScore,
    criteria,
    passed: overallScore >= 0.8,
  };
}

interface EvidenceResult {
  found: boolean;
  details: string;
}

function searchForEvidence(criterion: string, artifactPath: string): EvidenceResult {
  const keywords = criterion.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  let foundCount = 0;
  let searchedFiles = 0;

  function searchDir(dir: string, depth: number = 0): void {
    if (depth > 3) return;

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          searchDir(fullPath, depth + 1);
        } else if (stat.isFile() && isCodeFile(entry)) {
          searchedFiles++;
          try {
            const content = readFileSync(fullPath, 'utf-8').toLowerCase();
            const matches = keywords.filter((kw) => content.includes(kw)).length;
            if (matches >= Math.ceil(keywords.length / 2)) {
              foundCount++;
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  if (existsSync(artifactPath)) {
    const stat = statSync(artifactPath);
    if (stat.isDirectory()) {
      searchDir(artifactPath);
    } else if (stat.isFile()) {
      searchedFiles = 1;
      try {
        const content = readFileSync(artifactPath, 'utf-8').toLowerCase();
        const matches = keywords.filter((kw) => content.includes(kw)).length;
        if (matches >= Math.ceil(keywords.length / 2)) {
          foundCount++;
        }
      } catch {
        // Skip
      }
    }
  }

  return {
    found: foundCount > 0,
    details: searchedFiles > 0
      ? `Found evidence in ${foundCount} of ${searchedFiles} searched files`
      : 'No files searched',
  };
}

function isCodeFile(filename: string): boolean {
  const codeExts = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.md'];
  return codeExts.some((ext) => filename.endsWith(ext));
}

function calculateGoalAlignment(seed: SeedSpec, artifactPath: string): number {
  // Simplified goal alignment check
  if (!seed.goal) return 0.5;

  const goalKeywords = seed.goal.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const evidence = searchForEvidence(seed.goal, artifactPath);

  return evidence.found ? 0.9 : 0.5;
}

function calculateDrift(seed: SeedSpec, artifactPath: string): number {
  // Simplified drift calculation
  // In a full implementation, this would compare ontology fields, constraints, etc.
  return 0.1; // Assume low drift for now
}
