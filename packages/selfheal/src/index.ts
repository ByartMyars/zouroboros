/**
 * Zouroboros Self-Heal
 *
 * Self-diagnostic, prescription, and evolution system for autonomous improvement.
 *
 * @module zouroboros-selfheal
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { buildScorecard, formatScorecard } from './introspect/scorecard.js';
import { getPlaybook } from './prescribe/playbook.js';
import { evaluatePrescription } from './prescribe/governor.js';
import { generateSeed, generateProgram } from './prescribe/seed.js';
import { executeEvolution } from './evolve/executor.js';
import type { Scorecard, Prescription, EvolutionResult } from './types.js';

export const VERSION = '2.0.0';

export * from './types.js';
export * from './introspect/scorecard.js';
export * from './prescribe/playbook.js';
export * from './prescribe/governor.js';
export * from './prescribe/seed.js';
export * from './evolve/executor.js';
export * from './feedback.js';
export * from './multi-metric.js';
export * from './templates.js';
export * from './history.js';

export interface IntrospectOptions {
  json?: boolean;
  store?: boolean;
  verbose?: boolean;
}

export interface PrescribeOptions {
  scorecard?: string;
  live?: boolean;
  target?: string;
}

export interface EvolveOptions {
  prescription?: string;
  dryRun?: boolean;
  skipGovernor?: boolean;
}

const RESULTS_DIR = join(process.env.ZO_WORKSPACE || '/home/workspace', '.zo/selfheal');

export class SelfHeal {
  async introspect(options: IntrospectOptions = {}): Promise<Scorecard> {
    const scorecard = await buildScorecard();

    if (options.verbose) {
      console.log(formatScorecard(scorecard));
    }

    if (options.json) {
      console.log(JSON.stringify(scorecard, null, 2));
    }

    if (options.store) {
      mkdirSync(RESULTS_DIR, { recursive: true });
      const path = join(RESULTS_DIR, `scorecard-${Date.now()}.json`);
      writeFileSync(path, JSON.stringify(scorecard, null, 2));
    }

    return scorecard;
  }

  async prescribe(options: PrescribeOptions = {}): Promise<Prescription> {
    // Load or build scorecard
    let scorecard: Scorecard;
    if (options.scorecard) {
      scorecard = JSON.parse(readFileSync(options.scorecard, 'utf-8'));
    } else {
      scorecard = await buildScorecard();
    }

    // Find the target metric (weakest by default)
    const targetName = options.target || scorecard.weakest;
    const metric = scorecard.metrics.find(m => m.name === targetName) || scorecard.metrics[0];

    const playbook = getPlaybook(metric);
    const governor = evaluatePrescription(playbook, metric);
    const seed = generateSeed(playbook, metric);
    const program = generateProgram(playbook, metric);

    const prescription: Prescription = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      metric,
      playbook,
      seed,
      program,
      governor,
    };

    return prescription;
  }

  async evolve(options: EvolveOptions = {}): Promise<EvolutionResult> {
    let prescription: Prescription;
    if (options.prescription) {
      prescription = JSON.parse(readFileSync(options.prescription, 'utf-8'));
    } else {
      prescription = await this.prescribe();
    }

    return executeEvolution(prescription, {
      dryRun: options.dryRun,
      skipGovernor: options.skipGovernor,
    });
  }
}
