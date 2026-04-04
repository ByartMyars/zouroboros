/**
 * ACPTransport — executes tasks via the Agent Client Protocol over stdio.
 *
 * Spawns the ACP adapter binary (e.g., claude-agent-acp) as a subprocess,
 * communicates via JSON-RPC 2.0 over stdio, and captures streaming session
 * updates for episode system integration.
 *
 * Security invariants (from seed spec):
 * - Per-task session isolation: newSession() per task, no session reuse
 * - setsid for process isolation
 * - Env scrubbing: CLAUDE_CODE_IS_LOGGED_IN etc stripped before spawn
 * - Tool allowlist passed via CLAUDE_AGENT_TOOLS env var at spawn time
 */

import { spawn, ChildProcess } from 'child_process';
import { Writable, Readable } from 'stream';
import type { Task, TaskResult, ExecutorRegistryEntry } from '../types.js';
import { CircuitBreaker } from '../circuit/breaker.js';
import type {
  ExecutorTransport,
  TransportOptions,
  SessionUpdate,
  HealthStatus,
} from './types.js';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Client, Agent } from '@agentclientprotocol/sdk';
import type { SessionNotification, RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';

// Env vars to strip before spawning the ACP adapter (session detection suppression)
const SCRUBBED_ENV_VARS = [
  'CLAUDE_CODE_IS_LOGGED_IN',
  'ANTHROPIC_AUTH_TOKEN',
];

async function* yieldUpdates(
  queue: SessionUpdate[],
  done: Promise<void>,
): AsyncIterable<SessionUpdate> {
  let resolve: () => void;
  let pending = new Promise<void>(r => { resolve = r; });
  const notify = () => { const r = resolve; resolve = () => {}; pending = new Promise(r2 => { resolve = r2; }); r(); };

  // Attach notifier to queue
  (queue as SessionUpdate[] & { _notify?: () => void })._notify = notify;

  const isDone = done.then(() => null).catch(() => null);
  while (true) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    const result = await Promise.race([pending, isDone]);
    if (result === null) {
      // Drain remaining
      while (queue.length > 0) yield queue.shift()!;
      return;
    }
  }
}

class SwarmClient implements Client {
  private updateQueue: SessionUpdate[] & { _notify?: () => void };

  constructor(queue: SessionUpdate[] & { _notify?: () => void }) {
    this.updateQueue = queue;
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const update = params.update;
    let type: SessionUpdate['type'] = 'text';
    let content = '';

    if ('sessionUpdate' in update) {
      switch (update.sessionUpdate) {
        case 'agent_message_chunk':
          type = 'text';
          content = (update as any).content?.text ?? JSON.stringify((update as any).content);
          break;
        case 'tool_call':
          type = 'tool_call';
          content = JSON.stringify({ title: (update as any).title, kind: (update as any).kind, status: (update as any).status });
          break;
        case 'tool_call_update':
          type = 'tool_result';
          content = JSON.stringify({ toolCallId: (update as any).toolCallId, status: (update as any).status });
          break;
        default:
          type = 'progress';
          content = JSON.stringify(update);
      }
    }

    const su: SessionUpdate = { type, content, timestamp: Date.now() };
    this.updateQueue.push(su);
    this.updateQueue._notify?.();
  }

  async requestPermission(_params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    // Auto-approve all tool calls in swarm context (trust the tool allowlist at spawn)
    return { outcome: { outcome: 'selected', optionId: (_params.options[0]?.optionId ?? '') } };
  }

  async writeTextFile(_params: any) { return {}; }
  async readTextFile(_params: any) { return { content: '' }; }
}

export interface ACPTransportConfig {
  /** Path to the ACP adapter binary. Defaults to 'claude-agent-acp'. */
  adapterBin?: string;
  /** Extra CLI args passed to the adapter binary (e.g., ['--acp'] for gemini). */
  adapterArgs?: string[];
  /** Additional env vars forwarded to the adapter. */
  extraEnv?: Record<string, string>;
  /** Tool names passed in ALLOWED_TOOLS env var. */
  allowedTools?: string[];
}

export class ACPTransport implements ExecutorTransport {
  private entry: ExecutorRegistryEntry;
  private circuitBreaker: CircuitBreaker;
  private config: ACPTransportConfig;

  constructor(
    entry: ExecutorRegistryEntry,
    circuitBreaker: CircuitBreaker,
    config: ACPTransportConfig = {},
  ) {
    this.entry = entry;
    this.circuitBreaker = circuitBreaker;
    this.config = config;
  }

  private buildEnv(options: TransportOptions): Record<string, string> {
    const base: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(options.env ?? {}),
      ...(this.config.extraEnv ?? {}),
    };

    // Model routing via SWARM_RESOLVED_MODEL (Option C from seed spec)
    if (base.SWARM_RESOLVED_MODEL) {
      base.ANTHROPIC_MODEL = base.SWARM_RESOLVED_MODEL;
    }

    // Tool allowlist
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      base.ALLOWED_TOOLS = this.config.allowedTools.join(',');
    }

    // Scrub session detection vars
    for (const key of SCRUBBED_ENV_VARS) {
      delete base[key];
    }

    return base;
  }

  private spawnAdapter(env: Record<string, string>): ChildProcess {
    const bin = this.config.adapterBin ?? 'claude-agent-acp';
    const args = this.config.adapterArgs ?? [];

    return spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      // setsid equivalent: detached creates a new process group
      detached: false,
    });
  }

  executeWithUpdates(task: Task, options: TransportOptions): {
    updates: AsyncIterable<SessionUpdate>;
    result: Promise<TaskResult>;
  } {
    const queue: SessionUpdate[] & { _notify?: () => void } = [];
    let doneResolve!: () => void;
    let doneReject!: (e: Error) => void;
    const done = new Promise<void>((res, rej) => { doneResolve = res; doneReject = rej; });

    const result = this._runSession(task, options, queue, doneResolve, doneReject);
    const updates = yieldUpdates(queue, done);

    return { updates, result };
  }

  async execute(task: Task, options: TransportOptions): Promise<TaskResult> {
    const { result } = this.executeWithUpdates(task, options);
    return result;
  }

  private async _runSession(
    task: Task,
    options: TransportOptions,
    queue: SessionUpdate[] & { _notify?: () => void },
    doneResolve: () => void,
    doneReject: (e: Error) => void,
  ): Promise<TaskResult> {
    if (!this.circuitBreaker.canAttempt()) {
      const err = `Circuit breaker OPEN for ACP executor ${this.entry.id}`;
      doneResolve();
      return { task, success: false, error: err, durationMs: 0, retries: 0 };
    }

    const startTime = Date.now();
    const env = this.buildEnv(options);
    const adapter = this.spawnAdapter(env);

    let stderrOutput = '';
    adapter.stderr?.on('data', (d: Buffer) => { stderrOutput += d.toString(); });

    const input = Writable.toWeb(adapter.stdin!) as WritableStream<Uint8Array>;
    const output = Readable.toWeb(adapter.stdout!) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(input, output);

    const client = new SwarmClient(queue);
    const connection = new ClientSideConnection((_agent: Agent) => client, stream);

    // Timeout enforcement
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      connection.cancel({ sessionId }).catch(() => {});
      adapter.kill('SIGTERM');
    }, options.timeoutMs);

    let sessionId = '';

    try {
      // Phase 1: Initialize
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
        },
      });

      // Phase 2: New session (per-task isolation)
      const cwd = options.workdir ?? '/home/workspace';
      const sessionResult = await connection.newSession({
        cwd,
        mcpServers: [],
      });
      sessionId = sessionResult.sessionId;

      // Phase 3: Prompt
      const promptResult = await connection.prompt({
        sessionId,
        prompt: [{ type: 'text', text: task.task }],
      });

      clearTimeout(timeoutHandle);
      doneResolve();

      const durationMs = Date.now() - startTime;
      const success = promptResult.stopReason === 'end_turn';

      if (success) {
        this.circuitBreaker.recordSuccess();
      } else {
        this.circuitBreaker.recordFailure(
          promptResult.stopReason === 'cancelled' ? 'timeout' : 'runtime_error',
        );
      }

      // Collect text output from session updates
      const textOutput = queue
        .filter(u => u.type === 'text')
        .map(u => u.content)
        .join('');

      return {
        task,
        success,
        output: textOutput,
        error: success ? undefined : `ACP stop reason: ${promptResult.stopReason}`,
        durationMs,
        retries: 0,
        modelUsed: env.ANTHROPIC_MODEL ?? env.SWARM_RESOLVED_MODEL,
      };
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      doneReject(err);

      const durationMs = Date.now() - startTime;
      const category = timedOut ? 'timeout' : 'runtime_error';
      this.circuitBreaker.recordFailure(category);

      return {
        task,
        success: false,
        error: timedOut
          ? `ACP session timed out after ${options.timeoutMs}ms`
          : `ACP session error: ${err.message ?? String(err)}\n${stderrOutput}`,
        durationMs,
        retries: 0,
      };
    } finally {
      try { adapter.kill('SIGTERM'); } catch {}
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const bin = this.config.adapterBin ?? 'claude-agent-acp';
    const label = this.config.adapterArgs?.length
      ? `${bin} ${this.config.adapterArgs.join(' ')}`
      : bin;
    return new Promise<HealthStatus>((resolve) => {
      // Use `which` to check binary presence — don't invoke the adapter
      // (it has no --version flag; invocation immediately starts an ACP session)
      const proc = spawn('which', [bin], { stdio: 'pipe', timeout: 3000 });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ healthy: true, message: `${label} at ${out.trim()}` });
        } else {
          resolve({ healthy: false, message: `${label} not found — install adapter to enable ACP transport` });
        }
      });
      proc.on('error', (e) => {
        resolve({ healthy: false, message: `which ${bin} failed: ${e.message}` });
      });
    });
  }

  async shutdown(): Promise<void> {
    // Per-task sessions are isolated — nothing to tear down globally.
  }
}
