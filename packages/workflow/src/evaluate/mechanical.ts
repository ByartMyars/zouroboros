/**
 * Stage 1: Mechanical verification
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { MechanicalCheck } from './types.js';

/**
 * Run mechanical checks on an artifact
 */
export function runMechanicalChecks(artifactPath: string): MechanicalCheck[] {
  const checks: MechanicalCheck[] = [];

  const hasPackageJson = existsSync(join(artifactPath, 'package.json'));
  const hasTsConfig = existsSync(join(artifactPath, 'tsconfig.json'));
  const hasPyFiles = hasPythonFiles(artifactPath);

  // TypeScript checks
  if (hasTsConfig) {
    checks.push(checkTypeScript(artifactPath));
  }

  // Lint check
  if (hasPackageJson) {
    checks.push(checkLint(artifactPath));
    checks.push(checkTests(artifactPath));
  }

  // Python checks
  if (hasPyFiles) {
    checks.push(checkPythonSyntax(artifactPath));
  }

  return checks.filter(Boolean);
}

function checkTypeScript(artifactPath: string): MechanicalCheck {
  try {
    execSync(`cd "${artifactPath}" && npx tsc --noEmit 2>&1`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { name: 'TypeScript compile', passed: true, detail: 'No type errors' };
  } catch (e: any) {
    const output = e.stdout || e.message || 'Unknown error';
    const errorLines = output.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 5);
    return {
      name: 'TypeScript compile',
      passed: false,
      detail: errorLines.join('; ') || 'Compilation failed',
    };
  }
}

function checkLint(artifactPath: string): MechanicalCheck {
  try {
    const pkg = JSON.parse(readFileSync(join(artifactPath, 'package.json'), 'utf-8'));
    if (!pkg.scripts?.lint) {
      return { name: 'Lint', passed: true, detail: 'No lint script configured' };
    }
    execSync(`cd "${artifactPath}" && npm run lint 2>&1`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { name: 'Lint', passed: true, detail: 'No lint errors' };
  } catch (e: any) {
    const output = (e.stdout || '').split('\n').slice(-5).join('; ');
    return { name: 'Lint', passed: false, detail: output || 'Lint failed' };
  }
}

function checkTests(artifactPath: string): MechanicalCheck {
  try {
    const pkg = JSON.parse(readFileSync(join(artifactPath, 'package.json'), 'utf-8'));
    if (!pkg.scripts?.test) {
      return { name: 'Tests', passed: true, detail: 'No test script configured' };
    }
    const result = execSync(`cd "${artifactPath}" && npm test 2>&1`, {
      encoding: 'utf-8',
      timeout: 60000,
    });
    const passMatch = result.match(/(\d+)\s*(?:tests?\s*)?pass/i);
    return {
      name: 'Tests',
      passed: true,
      detail: passMatch ? `${passMatch[1]} passing` : 'All tests passed',
    };
  } catch (e: any) {
    const output = (e.stdout || '').split('\n').slice(-5).join('; ');
    return { name: 'Tests', passed: false, detail: output || 'Tests failed' };
  }
}

function checkPythonSyntax(artifactPath: string): MechanicalCheck {
  try {
    execSync(
      `cd "${artifactPath}" && python3 -m py_compile $(find . -name "*.py" -maxdepth 3 | head -10 | tr '\\n' ' ') 2>&1`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    return { name: 'Python syntax', passed: true, detail: 'No syntax errors' };
  } catch (e: any) {
    return { name: 'Python syntax', passed: false, detail: 'Syntax errors found' };
  }
}

function hasPythonFiles(artifactPath: string): boolean {
  try {
    const result = execSync(`find "${artifactPath}" -name "*.py" -maxdepth 3 | head -1`, {
      encoding: 'utf-8',
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
