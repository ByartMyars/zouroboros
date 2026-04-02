#!/usr/bin/env bun
/**
 * autoloop MCP Server — HTTP Transport v1.0
 *
 * Streamable HTTP MCP server for network access.
 * Runs as a Zo hosted service on PORT env var.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";

// --- Config ---
const PORT = parseInt(process.env.PORT || "48402");
const AUTOLOOP_SCRIPT = "/home/workspace/Skills/autoloop/scripts/autoloop.ts";
const RESULTS_DIR = "/home/workspace";
const BEARER_TOKEN = process.env.ZO_AUTOLOOP_MCP_TOKEN || "";

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
    return head.startsWith("ref: ") ? head.replace("ref: refs/heads/", "") : head.substring(0, 8);
  } catch { return null; }
}

function isLoopRunning(programPath: string): boolean {
  const lockFile = join(dirname(programPath), ".autoloop.lock");
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
  const programPath = args.program.startsWith("/") ? args.program : join("/home/workspace", args.program);
  
  if (!existsSync(programPath)) return `Program not found: ${programPath}`;
  
  const dir = dirname(programPath);
  const cmd = ["bun", "run", AUTOLOOP_SCRIPT, "--program", programPath];
  if (args.executor) cmd.push("--executor", args.executor);
  if (args.resume) cmd.push("--resume");
  if (args.dryRun) cmd.push("--dry-run");
  
  if (args.dryRun) {
    try {
      const proc = Bun.spawn(cmd, { cwd: dir });
      const output = await new Response(proc.stdout).text();
      return `Dry run: ${output}`;
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  }
  
  const proc = Bun.spawn(cmd, { cwd: dir, detached: true, stdout: "inherit", stderr: "inherit" });
  proc.unref();
  
  return `Autoloop started for ${basename(dir)}`;
}

function toolAutoloopStatus(args: { program: string }): string {
  const programPath = args.program.startsWith("/") ? args.program : join("/home/workspace", args.program);
  if (!existsSync(programPath)) return `Program not found`;
  
  const dir = dirname(programPath);
  const isRunning = isLoopRunning(programPath);
  const resultsPath = findResultsTsv(programPath);
  
  let output = `Status: ${isRunning ? "running" : "stopped"}\n`;
  const branch = findGitBranch(dir);
  if (branch) output += `Branch: ${branch}\n`;
  
  if (resultsPath && existsSync(resultsPath)) {
    const content = readFileSync(resultsPath, "utf-8");
    const lines = content.trim().split("\n");
    output += `Experiments: ${lines.length - 1}`;
  }
  
  return output;
}

function toolAutoloopResults(args: { program: string; limit?: number }): string {
  const programPath = args.program.startsWith("/") ? args.program : join("/home/workspace", args.program);
  const resultsPath = findResultsTsv(programPath);
  
  if (!resultsPath || !existsSync(resultsPath)) return "No results found.";
  
  const content = readFileSync(resultsPath, "utf-8");
  const lines = content.trim().split("\n");
  const limit = args.limit || lines.length;
  
  return lines.slice(0, limit + 1).join("\n");
}

async function toolAutoloopStop(args: { program: string }): Promise<string> {
  const programPath = args.program.startsWith("/") ? args.program : join("/home/workspace", args.program);
  const lockFile = join(dirname(programPath), ".autoloop.lock");
  
  if (!existsSync(lockFile)) return "Not running.";
  
  try {
    const pid = readFileSync(lockFile, "utf-8").trim();
    try { process.kill(parseInt(pid), "SIGTERM"); } catch {}
    await Bun.file(lockFile).delete();
    return "Stopped.";
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

function toolAutoloopList(args: { limit?: number }): string {
  const loops: Array<{ dir: string; mtime: number }> = [];
  
  const scanDir = (dir: string, depth = 0) => {
    if (depth > 3) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("node")) {
          const fullPath = join(dir, entry.name);
          if (existsSync(join(fullPath, "results.tsv"))) {
            loops.push({ dir: fullPath, mtime: 0 });
          }
          scanDir(fullPath, depth + 1);
        }
      }
    } catch {}
  };
  
  scanDir(RESULTS_DIR);
  
  const limit = args.limit || 10;
  return loops.slice(0, limit).map(l => basename(l.dir)).join("\n") || "No loops found.";
}

// ==========================================================================
// MCP SERVER + HTTP TRANSPORT
// ==========================================================================

const TOOLS_DEFINITION = [
  {
    name: "autoloop_start",
    description: "Start autoloop optimization.",
    inputSchema: {
      type: "object" as const,
      properties: {
        program: { type: "string" },
        executor: { type: "string" },
        resume: { type: "boolean" },
        dryRun: { type: "boolean" },
      },
      required: ["program"],
    },
  },
  {
    name: "autoloop_status",
    description: "Check autoloop status.",
    inputSchema: {
      type: "object" as const,
      properties: { program: { type: "string" } },
      required: ["program"],
    },
  },
  {
    name: "autoloop_results",
    description: "Get results.",
    inputSchema: {
      type: "object" as const,
      properties: { program: { type: "string" }, limit: { type: "number" } },
      required: ["program"],
    },
  },
  {
    name: "autoloop_stop",
    description: "Stop autoloop.",
    inputSchema: {
      type: "object" as const,
      properties: { program: { type: "string" } },
      required: ["program"],
    },
  },
  {
    name: "autoloop_list",
    description: "List recent loops.",
    inputSchema: {
      type: "object" as const,
      properties: { limit: { type: "number" } },
    },
  },
];

const sessions = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; server: Server }>();

function createSessionServer(requestedSessionId?: string) {
  const mcpServer = new Server(
    { name: "autoloop", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS_DEFINITION }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result: string;
      switch (name) {
        case "autoloop_start": result = await toolAutoloopStart(args as any); break;
        case "autoloop_status": result = toolAutoloopStatus(args as any); break;
        case "autoloop_results": result = toolAutoloopResults(args as any); break;
        case "autoloop_stop": result = await toolAutoloopStop(args as any); break;
        case "autoloop_list": result = toolAutoloopList(args as any); break;
        default: result = `Unknown: ${name}`;
      }
      return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => requestedSessionId || randomUUID(),
    onsessioninitialized: (id) => console.error(`[autoloop-mcp] Session: ${id}`),
    onsessionclosed: (id) => { console.error(`[autoloop-mcp] Closed: ${id}`); sessions.delete(id); },
  });

  mcpServer.connect(transport);
  return { transport, server: mcpServer };
}

function checkAuth(req: Request): boolean {
  if (!BEARER_TOKEN) return true;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  if (token.length !== BEARER_TOKEN.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ BEARER_TOKEN.charCodeAt(i);
  return mismatch === 0;
}

// --- Bun HTTP server ---
const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",  // Changed from "0.0.0.0" — localhost only
  idleTimeout: 0,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok", version: "1.0.0", tools: TOOLS_DEFINITION.map(t => t.name), sessions: sessions.size,
      }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/mcp") {
      if (!checkAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }

      const sessionId = req.headers.get("mcp-session-id") || url.searchParams.get("sessionId");

      if (sessionId && sessions.has(sessionId)) {
        return sessions.get(sessionId)!.transport.handleRequest(req);
      }

      const { transport, server: mcpServer } = createSessionServer(sessionId || undefined);
      const response = await transport.handleRequest(req);

      if (transport.sessionId) sessions.set(transport.sessionId, { transport, server: mcpServer });

      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.error(`[autoloop-mcp] HTTP server on http://0.0.0.0:${PORT}/mcp`);
console.error(`[autoloop-mcp] Auth: ${BEARER_TOKEN ? "required" : "none"}`);
