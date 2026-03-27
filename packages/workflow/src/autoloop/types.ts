/**
 * Types for autoloop optimization
 */

export interface MetricConfig {
  name: string;
  direction: 'lower_is_better' | 'higher_is_better';
  extract: string;
}

export interface ConstraintConfig {
  timeBudgetSeconds: number;
  maxExperiments: number;
  maxDurationHours: number;
  maxCostUSD: number;
}

export interface StagnationConfig {
  threshold: number;
  doubleThreshold: number;
  tripleThreshold: number;
}

export interface ProgramConfig {
  name: string;
  objective: string;
  metric: MetricConfig;
  setup: string;
  targetFile: string;
  runCommand: string;
  readOnlyFiles: string[];
  constraints: ConstraintConfig;
  stagnation: StagnationConfig;
  notes: string;
}

export interface ExperimentRecord {
  commit: string;
  metric: number;
  status: 'keep' | 'discard' | 'crash';
  description: string;
  timestamp: string;
  durationMs: number;
}

export interface LoopState {
  bestMetric: number;
  bestCommit: string;
  experimentCount: number;
  stagnationCount: number;
  totalCostUSD: number;
  startTime: number;
  results: ExperimentRecord[];
  branch: string;
}

export interface LoopStatus {
  running: boolean;
  state: LoopState | null;
  config: ProgramConfig | null;
}
