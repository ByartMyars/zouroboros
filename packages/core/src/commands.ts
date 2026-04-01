/**
 * ECC-002: Slash Commands Hub
 *
 * First-class CLI-style commands callable from any persona conversation.
 * Zero-dependency command parser with unified help, registration, and routing.
 * Supports subcommands: /memory search "query" → routes to memory.search handler.
 */

import type { HookSystem } from './hooks.js';

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category: string;
  args: ArgDefinition[];
  handler: CommandHandler;
  subcommands?: Map<string, SubcommandDefinition>;
  hidden?: boolean;
}

export interface SubcommandDefinition {
  name: string;
  description: string;
  usage: string;
  args: ArgDefinition[];
  handler: CommandHandler;
}

export interface ArgDefinition {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'flag';
  default?: unknown;
}

export interface ParsedCommand {
  name: string;
  subcommand?: string;
  args: Record<string, unknown>;
  raw: string;
  flags: Set<string>;
}

export interface CommandResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export type CommandHandler = (parsed: ParsedCommand) => CommandResult | Promise<CommandResult>;

export class CommandHub {
  private commands: Map<string, CommandDefinition> = new Map();
  private aliases: Map<string, string> = new Map();
  private hooks: HookSystem | null = null;

  /** Wire to hook system for command.execute events */
  wireHooks(hooks: HookSystem): void {
    this.hooks = hooks;
  }

  register(definition: CommandDefinition): void {
    if (!definition.name || !definition.name.startsWith('/')) {
      throw new Error(`Command name must start with '/': ${definition.name}`);
    }

    // Check for alias collisions
    for (const alias of definition.aliases) {
      const existing = this.aliases.get(alias);
      if (existing && existing !== definition.name) {
        throw new Error(`Alias '${alias}' already registered to '${existing}', cannot register for '${definition.name}'`);
      }
    }

    this.commands.set(definition.name, definition);
    for (const alias of definition.aliases) {
      this.aliases.set(alias, definition.name);
    }
  }

  /** Register a subcommand under an existing command */
  registerSubcommand(commandName: string, sub: SubcommandDefinition): void {
    const cmd = this.commands.get(commandName);
    if (!cmd) throw new Error(`Command '${commandName}' not found`);
    if (!cmd.subcommands) cmd.subcommands = new Map();
    cmd.subcommands.set(sub.name, sub);
  }

  unregister(name: string): boolean {
    const cmd = this.commands.get(name);
    if (!cmd) return false;

    for (const alias of cmd.aliases) {
      this.aliases.delete(alias);
    }
    this.commands.delete(name);
    return true;
  }

  resolve(nameOrAlias: string): CommandDefinition | null {
    const cmd = this.commands.get(nameOrAlias);
    if (cmd) return cmd;

    const canonical = this.aliases.get(nameOrAlias);
    if (canonical) return this.commands.get(canonical) || null;

    return null;
  }

  parse(input: string): ParsedCommand | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const parts = this.tokenize(trimmed);
    if (parts.length === 0) return null;

    const name = parts[0];
    const args: Record<string, unknown> = {};
    const flags = new Set<string>();
    let subcommand: string | undefined;

    const def = this.resolve(name);

    // Check for subcommand: if part[1] exists and matches a registered subcommand
    let argDefs: ArgDefinition[] = def?.args || [];
    let partStart = 1;

    if (def?.subcommands && parts.length > 1 && def.subcommands.has(parts[1])) {
      subcommand = parts[1];
      argDefs = def.subcommands.get(parts[1])!.args;
      partStart = 2;
    }

    let positionalIndex = 0;

    for (let i = partStart; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('--')) {
        const key = part.slice(2);
        const eqIdx = key.indexOf('=');
        if (eqIdx >= 0) {
          args[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
        } else {
          const argDef = argDefs.find(a => a.name === key);
          if (argDef?.type === 'flag' || argDef?.type === 'boolean') {
            flags.add(key);
            args[key] = true;
          } else if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
            args[key] = this.coerceArg(parts[++i], argDef?.type);
          } else {
            flags.add(key);
            args[key] = true;
          }
        }
      } else {
        const positionalDefs = argDefs.filter(a => a.type !== 'flag');
        if (positionalIndex < positionalDefs.length) {
          const argDef = positionalDefs[positionalIndex];
          args[argDef.name] = this.coerceArg(part, argDef.type);
        } else {
          args[`_${positionalIndex}`] = part;
        }
        positionalIndex++;
      }
    }

    // Apply defaults
    for (const argDef of argDefs) {
      if (argDef.default !== undefined && args[argDef.name] === undefined) {
        args[argDef.name] = argDef.default;
      }
    }

    return { name, subcommand, args, raw: trimmed, flags };
  }

  async execute(input: string): Promise<CommandResult> {
    const parsed = this.parse(input);
    if (!parsed) {
      return { success: false, output: '', error: 'Invalid command format. Commands must start with /' };
    }

    const cmd = this.resolve(parsed.name);
    if (!cmd) {
      const suggestions = this.suggest(parsed.name);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(', ')}?`
        : '';
      return { success: false, output: '', error: `Unknown command: ${parsed.name}.${suggestionText}` };
    }

    // Route to subcommand handler if applicable
    let handler = cmd.handler;
    let requiredArgs = cmd.args;

    if (parsed.subcommand && cmd.subcommands?.has(parsed.subcommand)) {
      const sub = cmd.subcommands.get(parsed.subcommand)!;
      handler = sub.handler;
      requiredArgs = sub.args;
    }

    // Validate required args
    for (const argDef of requiredArgs) {
      if (argDef.required && parsed.args[argDef.name] === undefined) {
        return {
          success: false,
          output: '',
          error: `Missing required argument: ${argDef.name}\nUsage: ${cmd.usage}`,
        };
      }
    }

    try {
      const result = await handler(parsed);

      // Emit command.execute hook event
      if (this.hooks) {
        this.hooks.emit('command.execute', {
          command: parsed.name,
          subcommand: parsed.subcommand,
          success: result.success,
        }, 'command-hub').catch(() => {});
      }

      return result;
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  help(commandName?: string): string {
    if (commandName) {
      const cmd = this.resolve(commandName);
      if (!cmd) return `Unknown command: ${commandName}`;

      const lines = [
        `${cmd.name} — ${cmd.description}`,
        `Usage: ${cmd.usage}`,
      ];
      if (cmd.aliases.length > 0) {
        lines.push(`Aliases: ${cmd.aliases.join(', ')}`);
      }
      if (cmd.subcommands && cmd.subcommands.size > 0) {
        lines.push('Subcommands:');
        for (const [subName, sub] of cmd.subcommands) {
          lines.push(`  ${subName} — ${sub.description}`);
        }
      }
      if (cmd.args.length > 0) {
        lines.push('Arguments:');
        for (const arg of cmd.args) {
          const req = arg.required ? '(required)' : `(default: ${arg.default ?? 'none'})`;
          lines.push(`  --${arg.name}  ${arg.description} ${req}`);
        }
      }
      return lines.join('\n');
    }

    // List all commands by category
    const byCategory = new Map<string, CommandDefinition[]>();
    for (const cmd of this.commands.values()) {
      if (cmd.hidden) continue;
      const list = byCategory.get(cmd.category) || [];
      list.push(cmd);
      byCategory.set(cmd.category, list);
    }

    const lines = ['Available Commands:', ''];
    for (const [category, cmds] of byCategory) {
      lines.push(`[${category}]`);
      for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
        const aliasStr = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        lines.push(`  ${cmd.name}${aliasStr} — ${cmd.description}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  suggest(partial: string): string[] {
    const lower = partial.toLowerCase();
    const matches: string[] = [];

    for (const name of this.commands.keys()) {
      if (name.toLowerCase().includes(lower) || this.levenshtein(name.toLowerCase(), lower) <= 2) {
        matches.push(name);
      }
    }
    for (const [alias, canonical] of this.aliases) {
      if (alias.toLowerCase().includes(lower)) {
        matches.push(`${alias} → ${canonical}`);
      }
    }

    return matches.slice(0, 5);
  }

  list(category?: string): CommandDefinition[] {
    const all = [...this.commands.values()];
    if (category) return all.filter(c => c.category === category);
    return all;
  }

  getCategories(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const cmd of this.commands.values()) {
      counts[cmd.category] = (counts[cmd.category] || 0) + 1;
    }
    return counts;
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const ch of input) {
      if (inQuote) {
        if (ch === quoteChar) {
          inQuote = false;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current.length > 0) tokens.push(current);
    return tokens;
  }

  private coerceArg(value: string, type?: string): unknown {
    if (type === 'number') {
      const n = Number(value);
      return isNaN(n) ? value : n;
    }
    if (type === 'boolean') {
      return value === 'true' || value === '1' || value === 'yes';
    }
    return value;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}

export function createCommandHub(): CommandHub {
  return new CommandHub();
}
