/**
 * ECC-005: Token Budget Hook Wiring
 *
 * Systematic token optimization with proactive checkpointing.
 * Monitors context usage and triggers compression/checkpoint hooks.
 */

import type { HookSystem, LifecycleEvent } from './hooks.js';

export interface TokenBudgetConfig {
  maxTokens: number;
  warningThreshold: number;  // 0-1, e.g. 0.70
  criticalThreshold: number; // 0-1, e.g. 0.85
  emergencyThreshold: number; // 0-1, e.g. 0.95
  compressionStrategy: CompressionStrategy;
}

export type CompressionStrategy = 'progressive' | 'aggressive' | 'selective';

export interface TokenState {
  currentTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  level: 'normal' | 'warning' | 'critical' | 'emergency';
  lastCheckpoint?: string;
  compressionCount: number;
  savedTokens: number;
}

export interface CompressionRecord {
  strategy: CompressionStrategy;
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  sections: string[];
  timestamp: string;
}

export interface CheckpointData {
  timestamp: string;
  tokenState: TokenState;
  activeTaskId?: string;
  context: Record<string, unknown>;
}

const DEFAULT_CONFIG: TokenBudgetConfig = {
  maxTokens: 200000,
  warningThreshold: 0.70,
  criticalThreshold: 0.85,
  emergencyThreshold: 0.95,
  compressionStrategy: 'progressive',
};

export class TokenBudgetManager {
  private config: TokenBudgetConfig;
  private hooks: HookSystem | null;
  private state: TokenState;
  private checkpoints: CheckpointData[] = [];
  private compressionHistory: CompressionRecord[] = [];

  constructor(config?: Partial<TokenBudgetConfig>, hooks?: HookSystem) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hooks = hooks || null;
    this.state = {
      currentTokens: 0,
      maxTokens: this.config.maxTokens,
      utilizationPercent: 0,
      level: 'normal',
      compressionCount: 0,
      savedTokens: 0,
    };
  }

  update(currentTokens: number): TokenState {
    this.state.currentTokens = currentTokens;
    this.state.maxTokens = this.config.maxTokens;
    this.state.utilizationPercent = currentTokens / this.config.maxTokens;

    const prevLevel = this.state.level;
    this.state.level = this.computeLevel();

    // Fire hooks on level transitions
    if (this.hooks && prevLevel !== this.state.level) {
      this.onLevelChange(prevLevel, this.state.level);
    }

    return { ...this.state };
  }

  getState(): TokenState {
    return { ...this.state };
  }

  checkpoint(context: Record<string, unknown> = {}, activeTaskId?: string): CheckpointData {
    const cp: CheckpointData = {
      timestamp: new Date().toISOString(),
      tokenState: { ...this.state },
      activeTaskId,
      context,
    };

    this.checkpoints.push(cp);
    if (this.checkpoints.length > 50) {
      this.checkpoints = this.checkpoints.slice(-50);
    }

    this.state.lastCheckpoint = cp.timestamp;
    return cp;
  }

  /**
   * Record a compression that was performed externally.
   * The caller is responsible for the actual context reduction —
   * this method tracks the bookkeeping and updates token state.
   */
  recordCompression(actualTokensAfter: number, sections: string[]): CompressionRecord {
    const tokensBefore = this.state.currentTokens;
    const saved = tokensBefore - actualTokensAfter;

    const record: CompressionRecord = {
      strategy: this.config.compressionStrategy,
      tokensBefore,
      tokensAfter: actualTokensAfter,
      saved: Math.max(saved, 0),
      sections,
      timestamp: new Date().toISOString(),
    };

    this.state.currentTokens = actualTokensAfter;
    this.state.compressionCount++;
    this.state.savedTokens += record.saved;
    this.state.utilizationPercent = this.state.currentTokens / this.config.maxTokens;
    this.state.level = this.computeLevel();

    this.compressionHistory.push(record);
    if (this.compressionHistory.length > 20) {
      this.compressionHistory = this.compressionHistory.slice(-20);
    }

    return record;
  }

  /**
   * Get the recommended compression target based on current strategy and state.
   * Returns the number of tokens that should remain after compression.
   */
  getCompressionTarget(): { targetTokens: number; reductionPercent: number } {
    const current = this.state.currentTokens;
    let reductionPercent: number;

    switch (this.config.compressionStrategy) {
      case 'progressive':
        reductionPercent = 0.20;
        break;
      case 'aggressive':
        reductionPercent = 0.40;
        break;
      case 'selective':
        reductionPercent = 0.15;
        break;
    }

    return {
      targetTokens: Math.floor(current * (1 - reductionPercent)),
      reductionPercent,
    };
  }

  getRecommendation(): { action: string; urgency: 'none' | 'low' | 'medium' | 'high'; details: string } {
    switch (this.state.level) {
      case 'emergency':
        return {
          action: 'immediate_checkpoint_and_compress',
          urgency: 'high',
          details: `At ${(this.state.utilizationPercent * 100).toFixed(1)}% — checkpoint now and aggressively compress. Pause swarm waves.`,
        };
      case 'critical':
        return {
          action: 'checkpoint_and_compress',
          urgency: 'medium',
          details: `At ${(this.state.utilizationPercent * 100).toFixed(1)}% — create checkpoint, apply progressive compression.`,
        };
      case 'warning':
        return {
          action: 'prepare_checkpoint',
          urgency: 'low',
          details: `At ${(this.state.utilizationPercent * 100).toFixed(1)}% — prepare checkpoint data, summarize old context.`,
        };
      default:
        return { action: 'none', urgency: 'none', details: 'Token budget healthy.' };
    }
  }

  getCheckpoints(): CheckpointData[] {
    return [...this.checkpoints];
  }

  getCompressionHistory(): CompressionRecord[] {
    return [...this.compressionHistory];
  }

  shouldPauseSwarm(): boolean {
    return this.state.level === 'emergency' || this.state.level === 'critical';
  }

  shouldCompress(): boolean {
    return this.state.level === 'critical' || this.state.level === 'emergency';
  }

  wireHooks(hooks: HookSystem): void {
    this.hooks = hooks;

    // Auto-checkpoint on conversation end
    hooks.on('conversation.end', (payload) => {
      this.checkpoint({ reason: 'conversation_end', ...payload.data });
    }, { priority: 10, description: 'Token budget auto-checkpoint on conversation end' });

    // Monitor context warnings — don't overwrite actual token state,
    // only trigger a checkpoint if we're already at warning level
    hooks.on('context.warning', () => {
      if (this.shouldCompress()) {
        this.checkpoint({ reason: 'context_warning_auto' });
      }
    }, { priority: 5, description: 'Token budget context warning handler' });

    hooks.on('context.critical', () => {
      this.checkpoint({ reason: 'context_critical_auto' });
    }, { priority: 5, description: 'Token budget context critical handler' });
  }

  private computeLevel(): 'normal' | 'warning' | 'critical' | 'emergency' {
    const util = this.state.utilizationPercent;
    if (util >= this.config.emergencyThreshold) return 'emergency';
    if (util >= this.config.criticalThreshold) return 'critical';
    if (util >= this.config.warningThreshold) return 'warning';
    return 'normal';
  }

  private onLevelChange(from: string, to: string): void {
    if (!this.hooks) return;

    const eventMap: Record<string, LifecycleEvent> = {
      warning: 'context.warning',
      critical: 'context.critical',
      emergency: 'context.emergency',
    };

    const event = eventMap[to];
    if (event) {
      this.hooks.emit(event, {
        from,
        to,
        utilization: this.state.utilizationPercent,
        currentTokens: this.state.currentTokens,
        maxTokens: this.config.maxTokens,
      }, 'token-budget');
    }
  }
}

export function createTokenBudget(config?: Partial<TokenBudgetConfig>, hooks?: HookSystem): TokenBudgetManager {
  return new TokenBudgetManager(config, hooks);
}
