#!/usr/bin/env bun
/**
 * autoloop MCP Server v1.0
 *
 * Exposes autonomous optimization loop as MCP tools.
 * Enables AI assistants to run metric-driven optimization campaigns.
 *
 * Tools:
 *   autoloop_start   — Start optimization with program.md
 *   autoloop_status  — Check current optimization progress
 *   autoloop_results — Get results.tsv data
 *   autoloop_stop    — Gracefully stop running loop
 *   autoloop_list    — List recent autoloop runs
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";

// --- Config ---
const AUTOLOOP_SCRIPT = "/home/workspace/Skills/autoloop/scripts/autoloop.ts";
const RESULTS_DIR = "/home/workspace";

// --- Helpers ---
function findResultsTsv(programPath: string): string | null {
  const dir = dirname(programPath);
  const tsvPath = join(dir, "results.tsv");
  return existsSync(tsvPath) ? tsvPath : null;
}

function findGitBranch(projectDir: string): string | null {
  const headPath = join(projectDir, ".git", "HEAD");
  if (!existsSync(headPath)) return null;
  
  try {
    const head = readFileSync(headPath, "utf-8").trim();
    if (head.startsWith("ref: ")) {
      return head.replace("ref: refs/heads/", "");
    }
    return head.substring(0, 8);
  } catch {
    return null;
  }
}

function listRecentLoops(limit = 10): Array<{
  program: string;
  branch: string | null;
  dir: string;
  hasResults: boolean;
}> {
  const loops: Array<{ program: string; branch: string | null; dir: string; hasResults: boolean; mtime: number }> = [];
  
  // Scan for results.tsv files
  const scanDir = (dir: string, depth = 0) => {
    if (depth > 3) return;
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("node_modules")) {
          const fullPath = join(dir, entry.name);
          
          // Check for results.tsv
          const tsvPath = join(fullPath, "results.tsv");
          if (existsSync(tsvPath)) {
            const programPath = join(fullPath, "program.md");
            const stat = existsSync(tsvPath) ? { mtimeMs: 0 } : { mtimeMs: 0 };
            loops.push({
              program: existsSync(programPath) ? basename(fullPath) : "unknown",
              branch: findGitBranch(fullPath),
              dir: fullPath,
              hasResults: true,
              mtime: stat.mtimeMs,
            });
          }
          
          // Recurse
          scanDir(fullPath, depth + 1);
        }
      }
    } catch {
      // Permission denied or other error
    }
  };
  
  scanDir(RESULTS_DIR);
  
  return loops
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ mtime, ...rest }) => rest);
}

function isLoopRunning(programPath: string): boolean {
  const dir = dirname(programPath);
  const branch = findGitBranch(dir);
  if (!branch?.startsWith("autoloop/")) return false;
  
  // Check for lock file or process
  const lockFile = join(dir, ".autoloop.lock");
  return existsSync(lockFile);
}

// ==========================================================================
// TOOL IMPLEMENTATIONS
// ==========================================================================

async function toolAutoloopStart(args: {
  program: string;
  executor?: string;
  resume?: boolean;
  dryRun?: boolean;
}): Promise<string> {
  const programPath = args.program.startsWith("/") 
    ? args.program 
    : join("/home/workspace", args.program);
  
  if (!existsSync(programPath)) {
    return `Program not found: ${programPath}`;
  }
  
  const dir = dirname(programPath);
  const cmd = [
    "bun", "run", AUTOLOOP_SCRIPT,
    "--program", programPath,
  ];
  
  if (args.executor) cmd.push("--executor", args.executor);
  if (args.resume) cmd.push("--resume");
  if (args.dryRun) cmd.push("--dry-run");
  
  if (args.dryRun) {
    // Run synchronously for dry-run
    try {
      const proc = Bun.spawn(cmd, { cwd: dir });
      const output = await new Response(proc.stdout).text();
      const error = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      if (exitCode === 0) {
        return `Dry run completed:\n\n${output}`;
      } else {
        return `Dry run failed:\n${error}`;
      }
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  }
  
  // Start in background
  const proc = Bun.spawn(cmd, {
    cwd: dir,
    detached: true,
    stdout: "inherit",
    stderr: "inherit",
  });
  proc.unref();
  
  const branchName = `autoloop/${basename(dir)}-${new Date().toISOString().slice(0, 10)}`;
  
  return `Autoloop started for ${basename(dir)}\n` +
    `Program: ${programPath}\n` +
    `Branch: ${branchName}\n` +
    `Check status: autoloop_status { "program": "${args.program}" }`;
}

function toolAutoloopStatus(args: {
  program: string;
}): string {
  const programPath = args.program.startsWith("/") 
    ? args.program 
    : join("/home/workspace", args.program);
  
  if (!existsSync(programPath)) {
    return `Program not found: ${programPath}`;
  }
  
  const dir = dirname(programPath);
  const isRunning = isLoopRunning(programPath);
  const resultsPath = findResultsTsv(programPath);
  
  let output = `Autoloop status for ${basename(dir)}:\n`;
  output += `Running: ${isRunning ? "YES" : "NO"}\n`;
  
  const branch = findGitBranch(dir);
  if (branch) {
    output += `Branch: ${branch}\n`;
  }
  
  if (resultsPath && existsSync(resultsPath)) {
    try {
      const content = readFileSync(resultsPath, "utf-8");
      const lines = content.trim().split("\n");
      
      if (lines.length > 1) {
        // Parse TSV
        const headers = lines[0].split("\t");
        const dataLines = lines.slice(1);
        
        output += `\nExperiments: ${dataLines.length}\n`;
        
        // Find improvement metrics
        const experimentCol = headers.indexOf("experiment");
        const improvedCol = headers.findIndex(h => h.toLowerCase().includes("improved"));
        
        if (improvedCol >= 0) {
          const improvedCount = dataLines.filter(l => {
            const cols = l.split("\t");
            return cols[improvedCol] === "true" || cols[improvedCol] === "1";
          }).length;
          output += `Improvements: ${improvedCount}/${dataLines.length}\n`;
        }
        
        // Show last few experiments
        output += `\nRecent experiments:\n`;
        dataLines.slice(-5).forEach((line, i) => {
          const cols = line.split("\t");
          const expNum = experimentCol >= 0 ? cols[experimentCol] : dataLines.length - 5 + i + 1;
          output += `  #${expNum}: ${cols.slice(1, 4).join(" | ")}\n`;
        });
      }
    } catch (error: any) {
      output += `\nError reading results: ${error.message}\n`;
    }
  } else {
    output += `\nNo results yet.\n`;
  }
  
  return output;
}

function toolAutoloopResults(args: {
  program: string;
  limit?: number;
}): string {
  const programPath = args.program.startsWith("/") 
    ? args.program 
    : join("/home/workspace", args.program);
  
  const resultsPath = findResultsTsv(programPath);
  
  if (!resultsPath || !existsSync(resultsPath)) {
    return `No results found for ${args.program}. Run autoloop first.`;
  }
  
  try {
    const content = readFileSync(resultsPath, "utf-8");
    const lines = content.trim().split("\n");
    
    if (lines.length <= 1) {
      return "Results file exists but contains no data.";
    }
    
    const limit = args.limit || lines.length;
    const headers = lines[0];
    const dataLines = lines.slice(1);
    const limitedData = dataLines.slice(-limit);
    
    return `Results for ${basename(dirname(resultsPath))}:\n\n` +
      `${headers}\n` +
      limitedData.join("\n") +
      `\n\n(${limitedData.length}/${dataLines.length} experiments shown)`;
  } catch (error: any) {
    return `Error reading results: ${error.message}`;
  }
}

async function toolAutoloopStop(args: {
  program: string;
}): Promise<string> {
  const programPath = args.program.startsWith("/") 
    ? args.program 
    : join("/home/workspace", args.program);
  
  const dir = dirname(programPath);
  const lockFile = join(dir, ".autoloop.lock");
  
  if (!existsSync(lockFile)) {
    return `No running autoloop found for ${basename(dir)}.`;
  }
  
  try {
    // Read PID from lock file and kill
    const pid = readFileSync(lockFile, "utf-8").trim();
    
    try {
      process.kill(parseInt(pid), "SIGTERM");
    } catch {
      // Process may not exist
    }
    
    // Remove lock file
    await Bun.file(lockFile).delete();
    
    return `Autoloop stopped for ${basename(dir)}.\n` +
      `Check results: autoloop_results { "program": "${args.program}" }`;
  } catch (error: any) {
    return `Error stopping autoloop: ${error.message}`;
  }
}

function toolAutoloopList(args: {
  limit?: number;
}): string {
  const loops = listRecentLoops(args.limit || 10);
  
  if (loops.length === 0) {
    return "No recent autoloop runs found.";
  }
  
  let output = `Recent autoloop runs (${loops.length}):\n\n`;
  loops.forEach(loop => {
    const status = loop.hasResults ? "\u2713 has results" : "\u25cb no results";
    const branchInfo = loop.branch ? ` — ${loop.branch}` : "";
    output += `${loop.program}${branchInfo} — ${status}\n`;
  });
  
  output += `\nGet details: autoloop_status { "program": "<path>/program.md" }`;
  return output;
}

// ==========================================================================
// MCP SERVER SETUP
// ==========================================================================

const server = new Server(
  { name: "autoloop", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "autoloop_start",
      description: "Start an autoloop optimization campaign. The agent will edit the target file, run experiments, measure metrics, and keep improvements.",
      inputSchema: {
        type: "object" as const,
        properties: {
          program: {
            type: "string",
            description: "Path to program.md file (absolute or relative to /home/workspace)"
          },
          executor: {
            type: "string",
            description: "Executor to use for proposals (default: claude-code)"
          },
          resume: {
            type: "boolean",
            description: "Resume from existing autoloop branch"
          },
          dryRun: {
            type: "boolean",
            description: "Parse program.md and show config without running"
          },
        },
        required: ["program"],
      },
    },
    {
      name: "autoloop_status",
      description: "Check the status of a running or completed autoloop campaign.",
      inputSchema: {
        type: "object" as const,
        properties: {
          program: {
            type: "string",
            description: "Path to program.md file"
          },
        },
        required: ["program"],
      },
    },
    {
      name: "autoloop_results",
      description: "Get the results.tsv data from a completed autoloop campaign.",
      inputSchema: {
        type: "object" as const,
        properties: {
          program: {
            type: "string",
            description: "Path to program.md file"
          },
          limit: {
            type: "number",
            description: "Maximum number of experiments to show (default: all)"
          },
        },
        required: ["program"],
      },
    },
    {
      name: "autoloop_stop",
      description: "Gracefully stop a running autoloop campaign.",
      inputSchema: {
        type: "object" as const,
        properties: {
          program: {
            type: "string",
            description: "Path to program.md file"
          },
        },
        required: ["program"],
      },
    },
    {
      name: "autoloop_list",
      description: "List recent autoloop campaigns.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10)"
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "autoloop_start":
        result = await toolAutoloopStart(args as any);
        break;
      case "autoloop_status":
        result = toolAutoloopStatus(args as any);
        break;
      case "autoloop_results":
        result = toolAutoloopResults(args as any);
        break;
      case "autoloop_stop":
        result = await toolAutoloopStop(args as any);
        break;
      case "autoloop_list":
        result = toolAutoloopList(args as any);
        break;
      default:
        result = `Unknown tool: ${name}`;
    }

    return { content: [{ type: "text", text: result }] };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message || error}` }],
      isError: true,
    };
  }
});

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("autoloop MCP server running on stdio");
}

main().catch(console.error);
