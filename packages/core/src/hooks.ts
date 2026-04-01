/**
 * ECC-001: Lifecycle Hook System
 *
 * Event-driven hooks that fire at structured points in the conversation lifecycle.
 * Hooks can be registered programmatically or loaded from hook definition files.
 */

export type LifecycleEvent =
  | 'conversation.start'
  | 'conversation.end'
  | 'task.start'
  | 'task.complete'
  | 'task.fail'
  | 'tool.call'
  | 'tool.result'
  | 'memory.store'
  | 'memory.search'
  | 'memory.threshold'
  | 'persona.switch'
  | 'context.warning'
  | 'context.critical'
  | 'context.emergency'
  | 'swarm.wave.start'
  | 'swarm.wave.end'
  | 'command.execute'
  | 'session.branch'
  | 'session.compact'
  | 'instinct.fired'
  | 'error.recovery';

export interface HookPayload {
  event: LifecycleEvent;
  timestamp: string;
  data: Record<string, unknown>;
  source?: string;
}

export type HookHandler = (payload: HookPayload) => void | Promise<void>;

export interface HookRegistration {
  id: string;
  event: LifecycleEvent | LifecycleEvent[];
  handler: HookHandler;
  priority: number; // lower = runs first
  once: boolean;
  enabled: boolean;
  description?: string;
}

export type HookDefinitionAction = 'log' | 'memory_capture' | 'checkpoint' | 'notify' | 'custom';

export interface HookDefinition {
  id: string;
  event: LifecycleEvent | LifecycleEvent[];
  action: HookDefinitionAction;
  priority?: number;
  once?: boolean;
  config?: Record<string, unknown>;
  description?: string;
}

/** Handler factory for pluggable definition actions */
export type DefinitionActionHandler = (def: HookDefinition) => HookHandler;

export interface HookStats {
  totalRegistered: number;
  totalFired: number;
  byEvent: Record<string, { registered: number; fired: number; avgLatencyMs: number }>;
  errors: number;
  lastFired?: string;
}

export class HookSystem {
  private hooks: Map<string, HookRegistration> = new Map();
  private eventIndex: Map<LifecycleEvent, Set<string>> = new Map();
  private actionHandlers: Map<string, DefinitionActionHandler> = new Map();
  private stats: {
    totalFired: number;
    byEvent: Record<string, { fired: number; totalLatency: number }>;
    errors: number;
    lastFired?: string;
  } = { totalFired: 0, byEvent: {}, errors: 0 };

  constructor() {
    // Register built-in action handlers
    this.registerAction('log', (def) => (payload) => {
      console.log(`[hook:${def.id}] ${payload.event}`, JSON.stringify(payload.data).slice(0, 200));
    });
    this.registerAction('notify', (def) => (payload) => {
      console.log(`[hook:${def.id}] Notification: ${payload.event}`, payload.data);
    });
    // memory_capture, checkpoint, custom — default to log until wired by integration layer
    this.registerAction('memory_capture', (def) => (payload) => {
      console.log(`[hook:${def.id}] Memory capture triggered by ${payload.event}`);
    });
    this.registerAction('checkpoint', (def) => (payload) => {
      console.log(`[hook:${def.id}] Checkpoint at ${payload.event}`);
    });
    this.registerAction('custom', (def) => (payload) => {
      console.log(`[hook:${def.id}] Custom action for ${payload.event}`);
    });
  }

  /** Register a pluggable action handler for HookDefinition actions */
  registerAction(action: string, factory: DefinitionActionHandler): void {
    this.actionHandlers.set(action, factory);
  }

  register(registration: HookRegistration): string {
    this.hooks.set(registration.id, registration);

    const events = Array.isArray(registration.event) ? registration.event : [registration.event];
    for (const event of events) {
      if (!this.eventIndex.has(event)) {
        this.eventIndex.set(event, new Set());
      }
      this.eventIndex.get(event)!.add(registration.id);
    }

    return registration.id;
  }

  on(event: LifecycleEvent | LifecycleEvent[], handler: HookHandler, options?: { priority?: number; description?: string }): string {
    const id = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.register({
      id,
      event,
      handler,
      priority: options?.priority ?? 100,
      once: false,
      enabled: true,
      description: options?.description,
    });
    return id;
  }

  once(event: LifecycleEvent | LifecycleEvent[], handler: HookHandler, options?: { priority?: number }): string {
    const id = `hook-once-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.register({
      id,
      event,
      handler,
      priority: options?.priority ?? 100,
      once: true,
      enabled: true,
    });
    return id;
  }

  off(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;

    this.hooks.delete(hookId);
    const events = Array.isArray(hook.event) ? hook.event : [hook.event];
    for (const event of events) {
      this.eventIndex.get(event)?.delete(hookId);
    }
    return true;
  }

  enable(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    hook.enabled = true;
    return true;
  }

  disable(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    hook.enabled = false;
    return true;
  }

  async emit(event: LifecycleEvent, data: Record<string, unknown> = {}, source?: string): Promise<void> {
    const hookIds = this.eventIndex.get(event);
    if (!hookIds || hookIds.size === 0) return;

    const payload: HookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      source,
    };

    // Sort by priority
    const hooks = [...hookIds]
      .map(id => this.hooks.get(id)!)
      .filter(h => h && h.enabled)
      .sort((a, b) => a.priority - b.priority);

    const start = Date.now();

    for (const hook of hooks) {
      try {
        await hook.handler(payload);
      } catch {
        this.stats.errors++;
      }

      if (hook.once) {
        this.off(hook.id);
      }
    }

    const latency = Date.now() - start;
    this.stats.totalFired++;
    this.stats.lastFired = payload.timestamp;
    if (!this.stats.byEvent[event]) {
      this.stats.byEvent[event] = { fired: 0, totalLatency: 0 };
    }
    this.stats.byEvent[event].fired++;
    this.stats.byEvent[event].totalLatency += latency;
  }

  emitSync(event: LifecycleEvent, data: Record<string, unknown> = {}, source?: string): void {
    const hookIds = this.eventIndex.get(event);
    if (!hookIds || hookIds.size === 0) return;

    const payload: HookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      source,
    };

    const hooks = [...hookIds]
      .map(id => this.hooks.get(id)!)
      .filter(h => h && h.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const hook of hooks) {
      try {
        const result = hook.handler(payload);
        // If handler returns a promise, catch errors without blocking
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => { this.stats.errors++; });
        }
      } catch {
        this.stats.errors++;
      }

      if (hook.once) {
        this.off(hook.id);
      }
    }

    this.stats.totalFired++;
    this.stats.lastFired = payload.timestamp;
    if (!this.stats.byEvent[event]) {
      this.stats.byEvent[event] = { fired: 0, totalLatency: 0 };
    }
    this.stats.byEvent[event].fired++;
  }

  loadDefinitions(definitions: HookDefinition[]): string[] {
    const ids: string[] = [];
    for (const def of definitions) {
      const factory = this.actionHandlers.get(def.action);
      const handler = factory ? factory(def) : (() => {});
      const id = this.register({
        id: def.id,
        event: def.event,
        handler,
        priority: def.priority ?? 100,
        once: def.once ?? false,
        enabled: true,
        description: def.description,
      });
      ids.push(id);
    }
    return ids;
  }

  getStats(): HookStats {
    const byEvent: Record<string, { registered: number; fired: number; avgLatencyMs: number }> = {};

    for (const [event, hookIds] of this.eventIndex) {
      const eventStats = this.stats.byEvent[event] || { fired: 0, totalLatency: 0 };
      byEvent[event] = {
        registered: hookIds.size,
        fired: eventStats.fired,
        avgLatencyMs: eventStats.fired > 0 ? eventStats.totalLatency / eventStats.fired : 0,
      };
    }

    return {
      totalRegistered: this.hooks.size,
      totalFired: this.stats.totalFired,
      byEvent,
      errors: this.stats.errors,
      lastFired: this.stats.lastFired,
    };
  }

  listHooks(): Array<{ id: string; events: LifecycleEvent[]; enabled: boolean; priority: number; description?: string }> {
    return [...this.hooks.values()].map(h => ({
      id: h.id,
      events: Array.isArray(h.event) ? h.event : [h.event],
      enabled: h.enabled,
      priority: h.priority,
      description: h.description,
    }));
  }

  clear(): void {
    this.hooks.clear();
    this.eventIndex.clear();
  }
}

// Singleton for ecosystem-wide hook system
let _globalHooks: HookSystem | null = null;

export function getHookSystem(): HookSystem {
  if (!_globalHooks) {
    _globalHooks = new HookSystem();
  }
  return _globalHooks;
}

export function createHookSystem(): HookSystem {
  return new HookSystem();
}

export function resetGlobalHooks(): void {
  _globalHooks = null;
}
