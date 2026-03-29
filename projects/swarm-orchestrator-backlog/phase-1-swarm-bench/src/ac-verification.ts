/**
 * SWARM-bench: Acceptance Criteria Verification Engine
 * 
 * Evaluates task outputs against defined acceptance criteria.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface VerificationResult {
  passed: boolean;
  score: number;
  details: string;
}

interface CriterionResult {
  passed: boolean;
  details: string;
}

export class AcceptanceCriteriaVerifier {
  /**
   * Evaluate a single criterion against task output
   */
  evaluateCriterion(
    criterion: {
      id: string;
      description: string;
      type: string;
      config: Record<string, unknown>;
    },
    taskOutput: string,
    workspaceId: string
  ): CriterionResult {
    const result: CriterionResult = { passed: false, details: '' };
    
    switch (criterion.type) {
      case 'output-contains':
        const expected = (criterion.config.expected as string) || '';
        result.passed = taskOutput.toLowerCase().includes(expected.toLowerCase());
        result.details = result.passed
          ? 'Output contains expected text'
          : `Output does not contain "${expected}"`;
        break;
        
      case 'content-contains':
        const contentExpected = (criterion.config.expected as string) || '';
        const filePath = criterion.config.filePath as string;
        if (filePath && existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          result.passed = content.toLowerCase().includes(contentExpected.toLowerCase());
          result.details = result.passed
            ? 'File contains expected text'
            : `File does not contain "${contentExpected}"`;
        } else {
          result.details = `File not found: ${filePath}`;
        }
        break;
        
      case 'file-exists':
        const checkPath = criterion.config.filePath as string;
        result.passed = existsSync(checkPath);
        result.details = result.passed ? 'File exists' : 'File does not exist';
        break;
        
      case 'content-regex':
        const pattern = (criterion.config.pattern as string) || '';
        try {
          const regex = new RegExp(pattern);
          result.passed = regex.test(taskOutput);
          result.details = result.passed
            ? 'Pattern matched in output'
            : `Pattern "${pattern}" not found`;
        } catch {
          result.details = `Invalid regex: ${pattern}`;
        }
        break;
        
      case 'no-error-pattern':
        const errorPattern = (criterion.config.pattern as string) || 'error';
        try {
          const regex = new RegExp(errorPattern, 'i');
          result.passed = !regex.test(taskOutput);
          result.details = result.passed
            ? 'No error pattern found'
            : `Error pattern "${errorPattern}" found in output`;
        } catch {
          result.details = `Invalid regex: ${errorPattern}`;
        }
        break;
        
      default:
        result.details = `Unknown criterion type: ${criterion.type}`;
    }
    
    return result;
  }
}

export default AcceptanceCriteriaVerifier;
