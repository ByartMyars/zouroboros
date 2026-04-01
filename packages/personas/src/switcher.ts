/**
 * Live Persona Switching
 *
 * Runtime persona changes without restart. Manages active persona state,
 * context handoff, and event notifications.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig } from './types.js';

export interface PersonaState {
  activeSlug: string;
  activeSince: string;
  previousSlug: string | null;
  switchCount: number;
  history: SwitchRecord[];
}

export interface SwitchRecord {
  from: string;
  to: string;
  timestamp: string;
  reason?: string;
  context?: Record<string, unknown>;
}

export interface SwitchOptions {
  reason?: string;
  carryContext?: boolean;
  context?: Record<string, unknown>;
  onSwitch?: (from: string, to: string) => void | Promise<void>;
}

export interface SwitchResult {
  success: boolean;
  from: string;
  to: string;
  error?: string;
}

type SwitchListener = (from: string, to: string, record: SwitchRecord) => void | Promise<void>;

export class PersonaSwitcher {
  private state: PersonaState;
  private personasDir: string;
  private stateFile: string;
  private listeners: SwitchListener[] = [];
  private configCache: Map<string, PersonaConfig> = new Map();

  constructor(personasDir: string, stateDir?: string) {
    this.personasDir = personasDir;
    const dir = stateDir || join(personasDir, '..', '.state');
    mkdirSync(dir, { recursive: true });
    this.stateFile = join(dir, 'persona-state.json');
    this.state = this.loadState();
  }

  get active(): string {
    return this.state.activeSlug;
  }

  get previous(): string | null {
    return this.state.previousSlug;
  }

  get switchCount(): number {
    return this.state.switchCount;
  }

  get history(): SwitchRecord[] {
    return [...this.state.history];
  }

  async switchTo(slug: string, options: SwitchOptions = {}): Promise<SwitchResult> {
    if (slug === this.state.activeSlug) {
      return {
        success: true,
        from: slug,
        to: slug,
      };
    }

    // Validate target persona exists
    const personaDir = join(this.personasDir, slug);
    if (!existsSync(personaDir)) {
      return {
        success: false,
        from: this.state.activeSlug,
        to: slug,
        error: `Persona "${slug}" not found at ${personaDir}`,
      };
    }

    const from = this.state.activeSlug;
    const record: SwitchRecord = {
      from,
      to: slug,
      timestamp: new Date().toISOString(),
      reason: options.reason,
      context: options.carryContext ? options.context : undefined,
    };

    // Update state
    this.state.previousSlug = from;
    this.state.activeSlug = slug;
    this.state.activeSince = record.timestamp;
    this.state.switchCount++;
    this.state.history.push(record);

    // Keep history bounded (last 100 switches)
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(-100);
    }

    this.saveState();

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        await listener(from, slug, record);
      } catch {
        // Don't let listener errors block the switch
      }
    }

    // Call the onSwitch callback if provided
    if (options.onSwitch) {
      try {
        await options.onSwitch(from, slug);
      } catch {
        // Don't let callback errors block the switch
      }
    }

    return {
      success: true,
      from,
      to: slug,
    };
  }

  async switchBack(options: SwitchOptions = {}): Promise<SwitchResult> {
    if (!this.state.previousSlug) {
      return {
        success: false,
        from: this.state.activeSlug,
        to: '',
        error: 'No previous persona to switch back to',
      };
    }

    return this.switchTo(this.state.previousSlug, {
      ...options,
      reason: options.reason || 'switch-back',
    });
  }

  onSwitch(listener: SwitchListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  getContextForSwitch(fromSlug: string): Record<string, unknown> | null {
    const lastSwitch = [...this.state.history]
      .reverse()
      .find(r => r.from === fromSlug && r.context);
    return lastSwitch?.context || null;
  }

  getActiveConfig(): PersonaConfig | null {
    return this.loadPersonaConfig(this.state.activeSlug);
  }

  listAvailable(): string[] {
    if (!existsSync(this.personasDir)) return [];

    const { readdirSync, statSync } = require('fs');
    return (readdirSync(this.personasDir) as string[])
      .filter((name: string) => {
        const path = join(this.personasDir, name);
        return statSync(path).isDirectory();
      });
  }

  resetState(): void {
    this.state = {
      activeSlug: 'default',
      activeSince: new Date().toISOString(),
      previousSlug: null,
      switchCount: 0,
      history: [],
    };
    this.saveState();
  }

  private loadState(): PersonaState {
    if (existsSync(this.stateFile)) {
      try {
        const content = readFileSync(this.stateFile, 'utf-8');
        return JSON.parse(content) as PersonaState;
      } catch {
        // Corrupted state file, reset
      }
    }

    return {
      activeSlug: 'default',
      activeSince: new Date().toISOString(),
      previousSlug: null,
      switchCount: 0,
      history: [],
    };
  }

  private saveState(): void {
    writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  private loadPersonaConfig(slug: string): PersonaConfig | null {
    if (this.configCache.has(slug)) {
      return this.configCache.get(slug)!;
    }

    const personaDir = join(this.personasDir, slug);
    if (!existsSync(personaDir)) return null;

    // Try to read a config.json if present
    const configPath = join(personaDir, 'config.json');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as PersonaConfig;
        this.configCache.set(slug, config);
        return config;
      } catch {
        // Fall through
      }
    }

    return null;
  }
}

export function createSwitcher(personasDir: string, stateDir?: string): PersonaSwitcher {
  return new PersonaSwitcher(personasDir, stateDir);
}
