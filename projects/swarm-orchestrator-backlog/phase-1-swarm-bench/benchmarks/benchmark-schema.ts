/**
 * SWARM-bench Benchmark Instance Schema
 * 
 * Defines the format for benchmark instances used to evaluate swarm orchestrator quality.
 * Each benchmark instance contains:
 * - A task specification
 * - Multiple acceptance criteria
 * - Expected outputs / ground truth
 * - Metadata for categorization
 */

export interface BenchmarkInstance {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Category for grouping similar tasks */
  category: BenchmarkCategory;
  
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  
  /** Task specification */
  task: TaskSpec;
  
  /** Acceptance criteria - all must pass for benchmark success */
  acceptanceCriteria: AcceptanceCriterion[];
  
  /** Ground truth / expected outputs */
  groundTruth?: GroundTruth;
  
  /** Workspace setup before task execution */
  workspaceSetup?: WorkspaceSetup;
  
  /** Metadata */
  metadata: BenchmarkMetadata;
}

export type BenchmarkCategory =
  | 'code-generation'
  | 'code-review'
  | 'refactoring'
  | 'bug-fix'
  | 'documentation'
  | 'test-generation'
  | 'analysis'
  | 'multi-file'
  | 'cross-repo';

export interface TaskSpec {
  /** The task description to pass to the orchestrator */
  prompt: string;
  
  /** Optional: Pre-seeded context */
  context?: string;
  
  /** Optional: Example outputs */
  examples?: string[];
  
  /** Optional: Constraints or requirements */
  constraints?: string[];
}

export interface AcceptanceCriterion {
  /** Unique identifier for this criterion */
  id: string;
  
  /** Human-readable description */
  description: string;
  
  /** Type of verification */
  type: ACType;
  
  /** Verification configuration */
  config: ACConfig;
}

export type ACType =
  | 'file-exists'
  | 'file-not-exists'
  | 'content-match'
  | 'content-contains'
  | 'content-regex'
  | 'output-contains'
  | 'output-regex'
  | 'schema-valid'
  | 'command-exec'
  | 'no-error-pattern'
  | 'all-of'
  | 'any-of';

export interface ACConfig {
  /** For file-based ACs */
  filePath?: string;
  
  /** For content-based ACs */
  expected?: string;
  pattern?: string;
  schema?: Record<string, unknown>;
  
  /** For command-based ACs */
  command?: string;
  expectedExitCode?: number;
  
  /** For composite ACs */
  criteria?: AcceptanceCriterion[];
}

export interface GroundTruth {
  /** Expected file contents */
  files?: Record<string, string>;
  
  /** Expected command outputs */
  commands?: Record<string, string>;
  
  /** Expected stdout/stderr patterns */
  outputPatterns?: {
    stdout?: string[];
    stderr?: string[];
  };
}

export interface WorkspaceSetup {
  /** Files to create before task execution */
  files?: Record<string, string>;
  
  /** Directories to create */
  directories?: string[];
  
  /** Initial git commits (for git-aware tasks) */
  gitHistory?: GitCommit[];
  
  /** Environment variables */
  env?: Record<string, string>;
}

export interface GitCommit {
  message: string;
  files: Record<string, string>;
}

export interface BenchmarkMetadata {
  /** Who created this benchmark */
  author: string;
  
  /** Creation date */
  createdAt: string;
  
  /** Last updated */
  updatedAt?: string;
  
  /** Tags for filtering */
  tags: string[];
  
  /** Known limitations or issues */
  notes?: string[];
  
  /** Average execution time (if known) */
  avgDurationSeconds?: number;
  
  /** Success rate across all executors */
  historicalPassRate?: Record<string, number>;
}

/**
 * Benchmark Result
 * Generated after running a benchmark instance
 */
export interface BenchmarkResult {
  instanceId: string;
  executor: string;      // Executor ID used
  executorId: string;    // Alias for executor
  
  swarmVersion?: string;  // Swarm orchestrator version
  startedAt: string;
  completedAt: string;
  createdAt?: string;    // Timestamp for storage
  
  durationMs: number;
  
  /** Per-criterion results */
  criterionResults: CriterionResult[];
  
  /** Overall result */
  passed: boolean;
  score: number;         // 0-1
  overallScore?: number;  // Alias for score
  grade?: string;         // A, B, C, D, F
  
  /** Execution details */
  taskOutput: string;
  errors?: string[];
  
  /** Comparison to ground truth */
  groundTruthMatch?: number; // 0-1
}

export interface CriterionResult {
  criterionId: string;
  description: string;
  passed: boolean;
  details?: string;
  durationMs?: number;
}

/**
 * Benchmark Report
 * Aggregated results across multiple instances/executors
 */
export interface BenchmarkReport {
  generatedAt: string;
  benchmarkVersion: string;
  orchestratorVersion: string;
  
  summary: {
    totalInstances: number;
    totalExecutors: number;
    overallPassRate: number;
    avgDurationMs: number;
  };
  
  byCategory: Record<string, CategoryStats>;
  byExecutor: Record<string, ExecutorStats>;
  byDifficulty: Record<string, DifficultyStats>;
  
  instances: BenchmarkResult[];
}

export interface CategoryStats {
  passRate: number;
  avgDurationMs: number;
  executorRankings: ExecutorRanking[];
}

export interface ExecutorStats {
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  avgDurationMs: number;
  avgScore: number;
  categories: Record<string, number>; // category -> pass count
}

export interface ExecutorRanking {
  executorId: string;
  passRate: number;
  avgDurationMs: number;
}

export interface DifficultyStats {
  passRate: number;
  avgDurationMs: number;
}

// Schema validation
export const BENCHMARK_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'category', 'difficulty', 'task', 'acceptanceCriteria', 'metadata'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9-]+$' },
    name: { type: 'string', minLength: 1 },
    category: { 
      type: 'string', 
      enum: ['code-generation', 'code-review', 'refactoring', 'bug-fix', 'documentation', 'test-generation', 'analysis', 'multi-file', 'cross-repo']
    },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'expert'] },
    task: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', minLength: 10 },
        context: { type: 'string' },
        examples: { type: 'array', items: { type: 'string' } },
        constraints: { type: 'array', items: { type: 'string' } }
      }
    },
    acceptanceCriteria: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/acceptanceCriterion' }
    },
    metadata: {
      type: 'object',
      required: ['author', 'createdAt', 'tags'],
      properties: {
        author: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  $defs: {
    acceptanceCriterion: {
      type: 'object',
      required: ['id', 'description', 'type', 'config'],
      properties: {
        id: { type: 'string' },
        description: { type: 'string' },
        type: { 
          type: 'string',
          enum: ['file-exists', 'file-not-exists', 'content-match', 'content-contains', 'content-regex', 'output-contains', 'output-regex', 'schema-valid', 'command-exec', 'no-error-pattern', 'all-of', 'any-of']
        },
        config: { type: 'object' }
      }
    }
  }
};
