import { test, expect, describe, mock } from 'bun:test';
import { join } from 'path';
import { MimirTransport } from '../transport/mimir-transport.js';
import { createTransport } from '../transport/factory.js';
import { loadRegistry, findExecutor } from '../registry/loader.js';
import type { Task, TaskResult } from '../types.js';
import type { TransportOptions } from '../transport/types.js';

const defaultOptions: TransportOptions = { timeoutMs: 15000 };
const REGISTRY_PATH = join(import.meta.dir, '..', 'executor', 'registry', 'executor-registry.json');
const SCHEMA_PATH = join(import.meta.dir, '..', 'db', 'schema.ts');

describe('Sage Node — DAG Integration', () => {
  test('registry resolves mimir executor with transport: mimir', () => {
    const registry = loadRegistry(REGISTRY_PATH);
    const mimir = findExecutor(registry, 'mimir');

    expect(mimir).toBeDefined();
    expect(mimir!.id).toBe('mimir');
    expect(mimir!.transport).toBe('mimir');
    expect(mimir!.expertise).toContain('memory');
    expect(mimir!.expertise).toContain('synthesis');
  });

  test('factory creates MimirTransport for mimir executor', () => {
    const registry = loadRegistry(REGISTRY_PATH);
    const entry = findExecutor(registry, 'mimir')!;

    // Factory needs a circuit breaker — pass a minimal mock
    const mockCB = {
      isOpen: () => false,
      recordSuccess: () => {},
      recordFailure: () => {},
      getState: () => 'closed',
      reset: () => {},
    };

    const transport = createTransport(entry, mockCB as any);
    expect(transport).toBeInstanceOf(MimirTransport);
  });

  test('sage node output can be injected into downstream task context', async () => {
    // Simulate: sage queries memory → returns synthesis → downstream task uses it
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/gate')) {
        return new Response(JSON.stringify({
          exit_code: 0,
          method: 'hybrid_search',
          output: '[Mimir Synthesis]\nThe auth middleware was rewritten in March 2026 for compliance. Session tokens must not be stored in cookies.',
          latency_ms: 2500,
        }), { status: 200 });
      }
      return originalFetch(url);
    }) as typeof fetch;

    const transport = new MimirTransport('http://localhost:7820');

    // Wave 1: Sage node queries context
    const sageTask: Task = {
      id: 'sage-consult',
      persona: 'mimir',
      task: 'What do we know about auth middleware security requirements?',
      priority: 'high',
      role: 'memory-sage',
    };
    const sageResult = await transport.execute(sageTask, defaultOptions);

    expect(sageResult.success).toBe(true);
    expect(sageResult.output).toContain('auth middleware');
    expect(sageResult.output).toContain('compliance');

    // Wave 2: Downstream task receives sage context (simulated)
    const implementTask: Task = {
      id: 'implement-auth',
      persona: 'claude-code',
      task: `Implement auth middleware. Historical context from sage:\n${sageResult.output}`,
      priority: 'high',
      depends: ['sage-consult'],
    };

    // Verify sage output was propagated into the downstream prompt
    expect(implementTask.task).toContain('Session tokens must not be stored in cookies');
    expect(implementTask.task).toContain('compliance');

    globalThis.fetch = originalFetch;
  });

  test('sage node gracefully handles no context (does not block DAG)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({
        exit_code: 2,
        method: 'keyword_heuristic',
        output: '',
        latency_ms: 5,
      }), { status: 200 });
    }) as typeof fetch;

    const transport = new MimirTransport('http://localhost:7820');
    const sageTask: Task = {
      id: 'sage-consult',
      persona: 'mimir',
      task: 'What do we know about quantum chromodynamics?',
      priority: 'high',
      role: 'memory-sage',
    };

    const result = await transport.execute(sageTask, defaultOptions);

    // Sage returns success even with no context — DAG continues
    expect(result.success).toBe(true);
    expect(result.output).toContain('No relevant historical context');
    expect(result.durationMs).toBeLessThan(5000);

    globalThis.fetch = originalFetch;
  });

  test('memory-sage role exists in DB schema seed', async () => {
    // Verify the role seed in schema.ts references memory-sage
    const schemaFile = await Bun.file(SCHEMA_PATH).text();
    
    expect(schemaFile).toContain("'memory-sage'");
    expect(schemaFile).toContain('Memory Sage (Mimir)');
    expect(schemaFile).toContain("executor_id: 'mimir'");
  });
});
