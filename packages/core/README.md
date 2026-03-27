# zouroboros-core

> Core types, configuration, and utilities for Zouroboros

## Installation

```bash
npm install zouroboros-core
# or
pnpm add zouroboros-core
```

## Usage

```typescript
import { 
  loadConfig, 
  saveConfig, 
  setConfigValue, 
  DEFAULT_CONFIG,
  ZouroborosConfig 
} from 'zouroboros-core';

// Load configuration
const config = loadConfig();

// Get a nested value
const dbPath = getConfigValue<string>(config, 'memory.dbPath');

// Update configuration
const updated = setConfigValue(config, 'memory.autoCapture', false);
saveConfig(updated);

// Initialize new configuration
const newConfig = await initConfig({
  workspaceRoot: '/home/workspace',
  dataDir: '/home/user/.zouroboros'
});
```

## API

### Types

All core types are exported from this package:

- `ZouroborosConfig` - Main configuration interface
- `MemoryConfig`, `MemoryEntry`, `EpisodicMemory` - Memory system types
- `SwarmConfig`, `SwarmCampaign`, `SwarmTask` - Swarm orchestration types
- `Persona`, `SafetyRule` - Persona management types
- `SeedSpec`, `EvaluationReport` - Workflow types
- And more...

### Configuration

- `loadConfig(path?)` - Load configuration from file
- `saveConfig(config, path?)` - Save configuration to file
- `initConfig(options?)` - Initialize new configuration
- `getConfigValue(config, path)` - Get nested config value
- `setConfigValue(config, path, value)` - Set nested config value
- `validateConfig(config)` - Validate configuration structure
- `mergeConfig(partial)` - Merge partial config with defaults

### Constants

- `DEFAULT_CONFIG` - Default configuration object
- `DEFAULT_CONFIG_PATH` - Default configuration file path
- `ZOUROBOROS_VERSION` - Current version
- `DECAY_DAYS` - Memory decay periods
- `COMPLEXITY_THRESHOLDS` - Complexity scoring thresholds
- And more...

### Utilities

- `generateUUID()` - Generate UUID v4
- `now()` - Get current ISO timestamp
- `retry(fn, options)` - Retry with exponential backoff
- `formatBytes(bytes)` - Format bytes to human readable
- `formatDuration(ms)` - Format milliseconds to duration
- `deepMerge(target, source)` - Deep merge objects
- And more...

## License

MIT
