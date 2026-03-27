# zouroboros-core

> Core types, configuration, and utilities for Zouroboros

## Installation

```bash
npm install zouroboros-core
```

## Usage

```typescript
import { loadConfig, saveConfig, setConfigValue, DEFAULT_CONFIG } from 'zouroboros-core';
import { ZouroborosConfig } from 'zouroboros-core';

// Load configuration
const config = loadConfig();

// Modify configuration
const newConfig = setConfigValue(config, 'memory.ollamaUrl', 'http://new-host:11434');

// Save configuration
saveConfig(newConfig);
```

## API

### `loadConfig(configPath?)`

Load configuration from file or return defaults.

### `saveConfig(config, configPath?)`

Save configuration to file.

### `getConfigValue(config, key)`

Get a nested config value using dot notation (e.g., `'memory.ollamaUrl'`).

### `setConfigValue(config, key, value)`

Set a nested config value using dot notation.

## Types

See `src/types.ts` for all TypeScript type definitions.
