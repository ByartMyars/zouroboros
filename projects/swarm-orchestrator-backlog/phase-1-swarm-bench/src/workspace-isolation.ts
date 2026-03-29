/**
 * SWARM-bench Workspace Isolation
 * 
 * Creates isolated workspaces for benchmark tasks.
 * Uses temp directories instead of git worktrees for portability.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface WorkspaceSetup {
  files?: Record<string, string>;
  directories?: string[];
  gitHistory?: string[];
  env?: Record<string, string>;
}

export interface Workspace {
  id: string;
  path: string;
  createdAt: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export class WorkspaceIsolation {
  private baseDir: string;
  
  constructor(baseDir: string = '/tmp/swarm-bench-workspaces') {
    this.baseDir = baseDir;
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }
  
  /**
   * Create a new isolated workspace
   */
  async createWorkspace(instanceId: string): Promise<Workspace> {
    const id = `bench-${instanceId}-${randomUUID().slice(0, 8)}`;
    const path = join(this.baseDir, id);
    
    mkdirSync(path, { recursive: true });
    
    return {
      id,
      path,
      createdAt: new Date().toISOString(),
    };
  }
  
  /**
   * Setup workspace with initial files
   */
  async setupWorkspace(workspaceId: string, setup: WorkspaceSetup): Promise<void> {
    const workspacePath = join(this.baseDir, workspaceId);
    
    // Create directories
    if (setup.directories) {
      for (const dir of setup.directories) {
        mkdirSync(join(workspacePath, dir), { recursive: true });
      }
    }
    
    // Create files
    if (setup.files) {
      for (const [filePath, content] of Object.entries(setup.files)) {
        const fullPath = join(workspacePath, filePath);
        const dir = join(fullPath, '..');
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content);
      }
    }
  }
  
  /**
   * Execute a task in the workspace
   */
  async executeBenchmark(
    workspaceId: string,
    taskPrompt: string,
    options: {
      executor?: string;
      timeout?: number;
      memory?: boolean;
    } = {}
  ): Promise<ExecutionResult> {
    const workspacePath = join(this.baseDir, workspaceId);
    const startTime = Date.now();
    
    // Create a task file with the prompt
    const taskFile = join(workspacePath, '.swarm-task.txt');
    writeFileSync(taskFile, taskPrompt);
    
    // For now, return a mock result indicating workspace was created
    // In production, this would call the actual executor bridge
    const durationMs = Date.now() - startTime;
    
    return {
      stdout: `Workspace ${workspaceId} created at ${workspacePath}\nTask: ${taskPrompt.slice(0, 100)}...`,
      stderr: '',
      exitCode: 0,
      durationMs,
    };
  }
  
  /**
   * Get workspace state
   */
  getWorkspaceState(workspaceId: string): { files: string[]; gitStatus: string } {
    const workspacePath = join(this.baseDir, workspaceId);
    
    const files: string[] = [];
    const collectFiles = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else {
          files.push(fullPath.replace(workspacePath + '/', ''));
        }
      }
    };
    
    if (existsSync(workspacePath)) {
      collectFiles(workspacePath);
    }
    
    return {
      files,
      gitStatus: 'Not a git repository (using temp directory isolation)',
    };
  }
  
  /**
   * Clean up a workspace
   */
  async cleanupWorkspace(workspaceId: string): Promise<void> {
    const workspacePath = join(this.baseDir, workspaceId);
    if (existsSync(workspacePath)) {
      rmSync(workspacePath, { recursive: true, force: true });
    }
  }
  
  /**
   * Clean up all workspaces
   */
  async cleanupAll(): Promise<void> {
    const entries = readdirSync(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        rmSync(join(this.baseDir, entry.name), { recursive: true, force: true });
      }
    }
  }
}

export default WorkspaceIsolation;
