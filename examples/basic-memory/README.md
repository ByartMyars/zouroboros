# Basic Memory Example

> Learn the fundamentals of Zouroboros memory system

## Setup

```bash
cd examples/basic-memory
zouroboros init
```

## Examples

### 1. Store a Fact

```typescript
import { Memory } from 'zouroboros-memory';

const memory = new Memory();

await memory.store({
  entity: 'user',
  key: 'name',
  value: 'Alice',
  category: 'preference',
  decayClass: 'permanent',
});
```

Or from Zo chat:
```
Store in memory that my name is Alice
```

### 2. Search Memory

```typescript
const results = await memory.search({
  query: 'user preferences',
  limit: 10,
});

console.log(results);
```

Or from Zo chat:
```
What do you know about me?
```

### 3. Capture a Conversation

```typescript
await memory.captureEpisode({
  summary: 'User asked about TypeScript best practices',
  outcome: 'success',
  entities: ['user', 'typescript'],
});
```

## Running the Example

```bash
bun run index.ts
```

## What's Next?

- Learn about [vector search](../../docs/architecture/memory-system.md)
- Explore [episodic memory](../../docs/architecture/memory-system.md#episodic)
- Try [graph-boosted search](../../docs/architecture/memory-system.md#graph-boost)