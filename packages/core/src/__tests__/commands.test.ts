import { describe, test, expect, beforeEach } from 'bun:test';
import { CommandHub, createCommandHub } from '../commands';
import type { CommandDefinition, ParsedCommand, CommandResult } from '../commands';

function makeCommand(name: string, overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    name,
    aliases: [],
    description: `Command ${name}`,
    usage: `${name} [args]`,
    category: 'system',
    args: [],
    handler: () => ({ success: true, output: `executed ${name}` }),
    ...overrides,
  };
}

describe('CommandHub', () => {
  let hub: CommandHub;

  beforeEach(() => {
    hub = createCommandHub();
  });

  describe('register', () => {
    test('registers a command', () => {
      hub.register(makeCommand('/test'));
      expect(hub.resolve('/test')).not.toBeNull();
    });

    test('rejects command without slash prefix', () => {
      expect(() => hub.register(makeCommand('test'))).toThrow();
    });

    test('registers aliases', () => {
      hub.register(makeCommand('/memory', { aliases: ['/mem', '/m'] }));
      expect(hub.resolve('/mem')).not.toBeNull();
      expect(hub.resolve('/m')).not.toBeNull();
    });

    test('detects alias collisions', () => {
      hub.register(makeCommand('/memory', { aliases: ['/m'] }));
      expect(() => hub.register(makeCommand('/metrics', { aliases: ['/m'] }))).toThrow(/already registered/);
    });
  });

  describe('unregister', () => {
    test('removes command and aliases', () => {
      hub.register(makeCommand('/test', { aliases: ['/t'] }));
      expect(hub.unregister('/test')).toBe(true);
      expect(hub.resolve('/test')).toBeNull();
      expect(hub.resolve('/t')).toBeNull();
    });

    test('returns false for non-existent command', () => {
      expect(hub.unregister('/nonexistent')).toBe(false);
    });
  });

  describe('parse', () => {
    test('parses simple command', () => {
      const parsed = hub.parse('/test');
      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe('/test');
    });

    test('returns null for non-command input', () => {
      expect(hub.parse('hello world')).toBeNull();
    });

    test('parses positional args', () => {
      hub.register(makeCommand('/search', {
        args: [{ name: 'query', description: 'Search query', required: true, type: 'string' }],
      }));

      const parsed = hub.parse('/search hello');
      expect(parsed!.args.query).toBe('hello');
    });

    test('parses named args with --', () => {
      hub.register(makeCommand('/config', {
        args: [{ name: 'key', description: 'Key', required: true, type: 'string' }],
      }));

      const parsed = hub.parse('/config --key myvalue');
      expect(parsed!.args.key).toBe('myvalue');
    });

    test('parses --key=value syntax', () => {
      const parsed = hub.parse('/test --count=5');
      expect(parsed!.args.count).toBe('5');
    });

    test('parses flags', () => {
      hub.register(makeCommand('/list', {
        args: [{ name: 'verbose', description: 'Verbose', required: false, type: 'flag' }],
      }));

      const parsed = hub.parse('/list --verbose');
      expect(parsed!.flags.has('verbose')).toBe(true);
      expect(parsed!.args.verbose).toBe(true);
    });

    test('coerces number args', () => {
      hub.register(makeCommand('/limit', {
        args: [{ name: 'count', description: 'Count', required: false, type: 'number' }],
      }));

      const parsed = hub.parse('/limit --count 42');
      expect(parsed!.args.count).toBe(42);
    });

    test('handles quoted strings', () => {
      hub.register(makeCommand('/note', {
        args: [{ name: 'text', description: 'Note text', required: true, type: 'string' }],
      }));

      const parsed = hub.parse('/note "hello world"');
      expect(parsed!.args.text).toBe('hello world');
    });

    test('applies default values', () => {
      hub.register(makeCommand('/show', {
        args: [{ name: 'limit', description: 'Limit', required: false, type: 'number', default: 10 }],
      }));

      const parsed = hub.parse('/show');
      expect(parsed!.args.limit).toBe(10);
    });

    test('parses subcommand', () => {
      hub.register(makeCommand('/memory'));
      hub.registerSubcommand('/memory', {
        name: 'search',
        description: 'Search memory',
        usage: '/memory search <query>',
        args: [{ name: 'query', description: 'Search query', required: true, type: 'string' }],
        handler: (parsed) => ({ success: true, output: `searched: ${parsed.args.query}` }),
      });

      const parsed = hub.parse('/memory search "test query"');
      expect(parsed!.subcommand).toBe('search');
      expect(parsed!.args.query).toBe('test query');
    });
  });

  describe('execute', () => {
    test('executes a registered command', async () => {
      hub.register(makeCommand('/hello', {
        handler: () => ({ success: true, output: 'Hello!' }),
      }));

      const result = await hub.execute('/hello');
      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello!');
    });

    test('returns error for unknown command', async () => {
      const result = await hub.execute('/unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command');
    });

    test('returns error for invalid format', async () => {
      const result = await hub.execute('not a command');
      expect(result.success).toBe(false);
    });

    test('validates required args', async () => {
      hub.register(makeCommand('/need', {
        args: [{ name: 'key', description: 'Required key', required: true, type: 'string' }],
      }));

      const result = await hub.execute('/need');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required argument');
    });

    test('catches handler errors', async () => {
      hub.register(makeCommand('/crash', {
        handler: () => { throw new Error('boom'); },
      }));

      const result = await hub.execute('/crash');
      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });

    test('handles async handlers', async () => {
      hub.register(makeCommand('/async', {
        handler: async () => ({ success: true, output: 'async done' }),
      }));

      const result = await hub.execute('/async');
      expect(result.success).toBe(true);
    });

    test('routes to subcommand handler', async () => {
      hub.register(makeCommand('/memory'));
      hub.registerSubcommand('/memory', {
        name: 'search',
        description: 'Search memory',
        usage: '/memory search <query>',
        args: [{ name: 'query', description: 'Search query', required: true, type: 'string' }],
        handler: (parsed) => ({ success: true, output: `found: ${parsed.args.query}` }),
      });

      const result = await hub.execute('/memory search "my query"');
      expect(result.success).toBe(true);
      expect(result.output).toBe('found: my query');
    });

    test('validates subcommand required args', async () => {
      hub.register(makeCommand('/memory'));
      hub.registerSubcommand('/memory', {
        name: 'search',
        description: 'Search memory',
        usage: '/memory search <query>',
        args: [{ name: 'query', description: 'Search query', required: true, type: 'string' }],
        handler: (parsed) => ({ success: true, output: 'ok' }),
      });

      const result = await hub.execute('/memory search');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required argument');
    });
  });

  describe('help', () => {
    test('generates help for all commands', () => {
      hub.register(makeCommand('/alpha', { category: 'memory' }));
      hub.register(makeCommand('/beta', { category: 'swarm' }));

      const help = hub.help();
      expect(help).toContain('/alpha');
      expect(help).toContain('/beta');
      expect(help).toContain('[memory]');
    });

    test('generates help for specific command', () => {
      hub.register(makeCommand('/test', {
        description: 'Test command',
        usage: '/test [options]',
        aliases: ['/t'],
        args: [{ name: 'verbose', description: 'Verbose output', required: false, type: 'flag' }],
      }));

      const help = hub.help('/test');
      expect(help).toContain('Test command');
      expect(help).toContain('/t');
      expect(help).toContain('verbose');
    });

    test('hides hidden commands', () => {
      hub.register(makeCommand('/visible'));
      hub.register(makeCommand('/hidden', { hidden: true }));

      const help = hub.help();
      expect(help).toContain('/visible');
      expect(help).not.toContain('/hidden');
    });

    test('lists subcommands in help', () => {
      hub.register(makeCommand('/memory'));
      hub.registerSubcommand('/memory', {
        name: 'search',
        description: 'Search memory',
        usage: '/memory search <query>',
        args: [],
        handler: () => ({ success: true, output: '' }),
      });

      const help = hub.help('/memory');
      expect(help).toContain('search');
      expect(help).toContain('Search memory');
    });
  });

  describe('suggest', () => {
    test('suggests similar commands', () => {
      hub.register(makeCommand('/memory'));
      hub.register(makeCommand('/metrics'));

      const suggestions = hub.suggest('/mem');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('/memory'))).toBe(true);
    });
  });

  describe('list', () => {
    test('lists all commands', () => {
      hub.register(makeCommand('/a', { category: 'memory' }));
      hub.register(makeCommand('/b', { category: 'swarm' }));

      expect(hub.list().length).toBe(2);
    });

    test('filters by category', () => {
      hub.register(makeCommand('/a', { category: 'memory' }));
      hub.register(makeCommand('/b', { category: 'swarm' }));

      expect(hub.list('memory').length).toBe(1);
    });
  });

  describe('getCategories', () => {
    test('returns category counts', () => {
      hub.register(makeCommand('/a', { category: 'memory' }));
      hub.register(makeCommand('/b', { category: 'memory' }));
      hub.register(makeCommand('/c', { category: 'eval' }));

      const cats = hub.getCategories();
      expect(cats.memory).toBe(2);
      expect(cats.eval).toBe(1);
    });
  });

  describe('hook integration', () => {
    test('emits command.execute hook event', async () => {
      const { createHookSystem } = await import('../hooks');
      const hooks = createHookSystem();
      hub.wireHooks(hooks);

      let emitted: Record<string, unknown> | null = null;
      hooks.on('command.execute', (payload) => {
        emitted = payload.data;
      });

      hub.register(makeCommand('/test'));
      await hub.execute('/test');

      await new Promise(r => setTimeout(r, 10));
      expect(emitted).not.toBeNull();
      expect(emitted!.command).toBe('/test');
      expect(emitted!.success).toBe(true);
    });
  });
});
