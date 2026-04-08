/**
 * Automated Gap Audit — the three manual questions as programmatic checks.
 *
 * 1. REACHABILITY: Does every capability have a caller, trigger, or wiring
 *    that invokes it? (Delegates to verify-wiring for import graph analysis.)
 *
 * 2. DATA PREREQUISITES: Are schemas populated, pools configured, maps seeded,
 *    and required bootstrap data in place?
 *
 * 3. CROSS-BOUNDARY STATE: Do env vars, file sentinels, or flags survive
 *    process boundaries?
 *
 * If ANY check fails: the audit reports the gap with remediation hints.
 * Run via CLI: zouroboros-swarm gap-audit [--fix] [--json]
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { CAPABILITY_MANIFEST, type Capability, type DataPrerequisite, type CrossBoundaryCheck } from './capabilities.js';
import { verifyWiring, type WiringReport } from './verify-wiring.js';

const SRC_DIR = resolve(dirname(new URL(import.meta.url).pathname), '..');
const WORKSPACE = process.env.SWARM_WORKSPACE || '/home/workspace';
const SWARM_DATA_DIR = join(WORKSPACE, '.swarm');

export type GapSeverity = 'critical' | 'warning' | 'info';
export type GapCategory = 'reachability' | 'data' | 'cross-boundary';

export interface Gap {
  capabilityId: string;
  category: GapCategory;
  severity: GapSeverity;
  message: string;
  remediation: string;
  autoFixable: boolean;
}

export interface GapAuditReport {
  timestamp: number;
  wiringReport: WiringReport;
  gaps: Gap[];
  passed: boolean;
  summary: {
    totalCapabilities: number;
    reachabilityGaps: number;
    dataGaps: number;
    crossBoundaryGaps: number;
    autoFixable: number;
  };
}

// ============================================================================
// DATA PREREQUISITE CHECKS
// ============================================================================

interface DataCheckResult {
  passed: boolean;
  actual: number | string;
  message: string;
}

/**
 * Check that executor registry has entries.
 */
function checkExecutorRegistryLoaded(): DataCheckResult {
  const registryPaths = [
    join(SRC_DIR, 'executor/registry/executor-registry.json'),
    join(WORKSPACE, 'Skills/zo-swarm-executors/registry/executor-registry.json'),
  ];

  for (const p of registryPaths) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'));
        const count = data.executors?.length ?? 0;
        return {
          passed: count > 0,
          actual: count,
          message: count > 0 ? `${count} executors loaded` : 'Registry is empty',
        };
      } catch {
        return { passed: false, actual: 0, message: `Failed to parse registry at ${p}` };
      }
    }
  }

  return { passed: false, actual: 0, message: 'No executor registry file found' };
}

/**
 * Check that RoleRegistry has seeded roles.
 * Reads SQLite directly to avoid starting the full orchestrator.
 */
function checkRolesSeeded(): DataCheckResult {
  const dbPath = join(SWARM_DATA_DIR, 'swarm.db');
  if (!existsSync(dbPath)) {
    return { passed: false, actual: 0, message: 'swarm.db does not exist (roles never initialized)' };
  }

  try {
    const { Database } = require('bun:sqlite');
    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT COUNT(*) as cnt FROM swarm_roles').get() as { cnt: number } | null;
    db.close();
    const count = row?.cnt ?? 0;
    return {
      passed: count > 0,
      actual: count,
      message: count > 0 ? `${count} roles seeded` : 'RoleRegistry is empty (0 roles)',
    };
  } catch (err) {
    return { passed: false, actual: 0, message: `Failed to query swarm.db: ${err}` };
  }
}

const DATA_CHECK_FNS: Record<string, () => DataCheckResult> = {
  checkExecutorRegistryLoaded,
  checkRolesSeeded,
};

// ============================================================================
// CROSS-BOUNDARY CHECKS
// ============================================================================

function checkEnvVar(name: string): { passed: boolean; message: string } {
  const value = process.env[name];
  return {
    passed: value !== undefined && value !== '',
    message: value ? `${name} is set` : `${name} is not set`,
  };
}

function checkFileSentinel(path: string): { passed: boolean; message: string } {
  // Resolve relative to SRC_DIR or WORKSPACE
  const candidates = [
    join(SRC_DIR, path),
    join(WORKSPACE, path),
    join(SWARM_DATA_DIR, path),
    path,
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      return { passed: true, message: `File sentinel found: ${p}` };
    }
  }

  return { passed: false, message: `File sentinel not found: ${path} (searched ${candidates.length} locations)` };
}

// ============================================================================
// MAIN AUDIT
// ============================================================================

export function runGapAudit(options: { fix?: boolean } = {}): GapAuditReport {
  const gaps: Gap[] = [];

  // ── Phase 1: Reachability (delegates to verify-wiring) ──
  const wiringReport = verifyWiring();

  for (const issue of wiringReport.issues) {
    if (issue.severity === 'error') {
      gaps.push({
        capabilityId: issue.capabilityId,
        category: 'reachability',
        severity: 'critical',
        message: `[WIRING] ${issue.message}`,
        remediation: getReachabilityRemediation(issue.type, issue),
        autoFixable: false,
      });
    } else if (issue.severity === 'warn') {
      gaps.push({
        capabilityId: issue.capabilityId,
        category: 'reachability',
        severity: 'warning',
        message: `[WIRING] ${issue.message}`,
        remediation: getReachabilityRemediation(issue.type, issue),
        autoFixable: false,
      });
    }
  }

  // ── Phase 2: Data Prerequisites ──
  for (const cap of CAPABILITY_MANIFEST) {
    for (const prereq of cap.dataPrerequisites) {
      if (prereq.checkFn && DATA_CHECK_FNS[prereq.checkFn]) {
        const result = DATA_CHECK_FNS[prereq.checkFn]();
        if (!result.passed) {
          gaps.push({
            capabilityId: cap.id,
            category: 'data',
            severity: 'critical',
            message: `[DATA] ${prereq.description}: ${result.message}`,
            remediation: getDataRemediation(prereq, cap),
            autoFixable: prereq.checkFn === 'checkRolesSeeded',
          });
        }
      }
    }
  }

  // ── Phase 3: Cross-Boundary State ──
  for (const cap of CAPABILITY_MANIFEST) {
    for (const check of cap.crossBoundary) {
      if (check.envVar) {
        const result = checkEnvVar(check.envVar);
        if (!result.passed) {
          gaps.push({
            capabilityId: cap.id,
            category: 'cross-boundary',
            severity: 'warning',
            message: `[ENV] ${check.description}: ${result.message}`,
            remediation: `Set environment variable ${check.envVar} in .env or system environment`,
            autoFixable: false,
          });
        }
      }

      if (check.fileSentinel) {
        const result = checkFileSentinel(check.fileSentinel);
        if (!result.passed) {
          gaps.push({
            capabilityId: cap.id,
            category: 'cross-boundary',
            severity: check.fileSentinel.endsWith('.db') ? 'warning' : 'critical',
            message: `[FILE] ${check.description}: ${result.message}`,
            remediation: getFileSentinelRemediation(check),
            autoFixable: false,
          });
        }
      }
    }
  }

  const reachabilityGaps = gaps.filter(g => g.category === 'reachability').length;
  const dataGaps = gaps.filter(g => g.category === 'data').length;
  const crossBoundaryGaps = gaps.filter(g => g.category === 'cross-boundary').length;
  const criticalGaps = gaps.filter(g => g.severity === 'critical').length;

  return {
    timestamp: Date.now(),
    wiringReport,
    gaps,
    passed: criticalGaps === 0,
    summary: {
      totalCapabilities: CAPABILITY_MANIFEST.length,
      reachabilityGaps,
      dataGaps,
      crossBoundaryGaps,
      autoFixable: gaps.filter(g => g.autoFixable).length,
    },
  };
}

// ============================================================================
// REMEDIATION HINTS
// ============================================================================

function getReachabilityRemediation(type: string, issue: any): string {
  switch (type) {
    case 'missing_export':
      return `Add "export" to the declaration of "${issue.expected}" in ${issue.file}`;
    case 'missing_import':
      return `Add an import of ${issue.expected} in ${issue.file}`;
    case 'missing_call_site':
      return `Wire up a call to pattern "${issue.expected}" in ${issue.file}`;
    case 'file_not_found':
      return `Create the missing file: ${issue.file}`;
    case 'orphaned_module':
      return `Import ${issue.file} from an entry point (index.ts or orchestrator.ts)`;
    default:
      return 'Manual investigation required';
  }
}

function getDataRemediation(prereq: DataPrerequisite, cap: Capability): string {
  if (prereq.checkFn === 'checkRolesSeeded') {
    return 'Run: bun packages/swarm/src/roles/persona-seeder.ts (or zouroboros-swarm roles seed)';
  }
  if (prereq.checkFn === 'checkExecutorRegistryLoaded') {
    return 'Ensure executor-registry.json has at least one executor entry';
  }
  return `Populate data for ${cap.name}: ${prereq.description}`;
}

function getFileSentinelRemediation(check: CrossBoundaryCheck): string {
  if (check.fileSentinel?.endsWith('.json')) {
    return `Create or restore ${check.fileSentinel} — it may have been deleted during cleanup`;
  }
  if (check.fileSentinel?.endsWith('.db')) {
    return `Initialize the database by running the swarm orchestrator once (it auto-creates on first use)`;
  }
  return `Ensure ${check.fileSentinel} exists at the expected location`;
}

// ============================================================================
// PRINTING
// ============================================================================

export function printGapAuditReport(report: GapAuditReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('GAP AUDIT REPORT');
  console.log('='.repeat(70));
  console.log(`  Capabilities: ${report.summary.totalCapabilities}`);
  console.log(`  Reachability gaps: ${report.summary.reachabilityGaps}`);
  console.log(`  Data gaps: ${report.summary.dataGaps}`);
  console.log(`  Cross-boundary gaps: ${report.summary.crossBoundaryGaps}`);
  console.log(`  Auto-fixable: ${report.summary.autoFixable}`);
  console.log('');

  if (report.gaps.length === 0) {
    console.log('  ✅ All gap audit checks passed — no gaps found.');
  } else {
    const byCat: Record<GapCategory, Gap[]> = {
      reachability: [],
      data: [],
      'cross-boundary': [],
    };
    for (const gap of report.gaps) {
      byCat[gap.category].push(gap);
    }

    for (const [cat, gaps] of Object.entries(byCat)) {
      if (gaps.length === 0) continue;
      const icon = cat === 'reachability' ? '🔗' : cat === 'data' ? '📊' : '🌐';
      console.log(`  ${icon} ${cat.toUpperCase()} (${gaps.length}):`);
      for (const gap of gaps) {
        const sev = gap.severity === 'critical' ? '✗' : gap.severity === 'warning' ? '⚠' : 'ℹ';
        console.log(`    ${sev} [${gap.capabilityId}] ${gap.message}`);
        console.log(`      → ${gap.remediation}`);
        if (gap.autoFixable) console.log(`      ⚡ Auto-fixable with --fix`);
      }
      console.log('');
    }
  }

  console.log('='.repeat(70));
  console.log(`  ${report.passed ? '✅ PASS' : '❌ FAIL'} (${report.gaps.filter(g => g.severity === 'critical').length} critical gaps)`);
  console.log('='.repeat(70));
}

// CLI entry point
if (import.meta.main) {
  const fix = process.argv.includes('--fix');
  const json = process.argv.includes('--json');

  const report = runGapAudit({ fix });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printGapAuditReport(report);
  }

  process.exit(report.passed ? 0 : 1);
}
