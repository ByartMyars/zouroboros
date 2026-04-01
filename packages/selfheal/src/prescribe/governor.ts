/**
 * Governor for self-prescription safety
 */

import type { Playbook, GovernorReport, MetricResult } from '../types.js';

export function evaluatePrescription(
  playbook: Playbook,
  metric: MetricResult
): GovernorReport {
  const flags: string[] = [];
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  // Governor rule 1: Schema migration check
  if (playbook.id.includes('schema') || playbook.targetFile?.includes('migration')) {
    flags.push('Touches database schema migrations');
    riskLevel = 'HIGH';
  }

  // Governor rule 2: File count check
  if (playbook.maxFiles > 3) {
    flags.push(`Modifies ${playbook.maxFiles} files (>3 threshold)`);
    if (riskLevel !== 'HIGH') riskLevel = 'MEDIUM';
  }

  // Governor rule 3: Executor bridge changes
  if (playbook.targetFile?.includes('bridge') || playbook.targetFile?.includes('executor')) {
    flags.push('Modifies executor bridges');
    riskLevel = 'HIGH';
  }

  // Governor rule 4: Critical metric with low baseline
  if (metric.status === 'CRITICAL' && metric.value < 0.3) {
    flags.push('Critical metric with very low baseline');
    if (riskLevel !== 'HIGH') riskLevel = 'MEDIUM';
  }

  // Governor rule 5: Already approved by playbook definition
  if (playbook.requiresApproval) {
    flags.push(playbook.approvalReason || 'Requires explicit approval');
    riskLevel = 'HIGH';
  }

  const approved = flags.length === 0;

  return {
    approved,
    flags,
    riskLevel,
    requiresHuman: !approved,
    reason: approved
      ? 'Prescription approved for autonomous execution'
      : `Governor flags: ${flags.join('; ')}`,
  };
}