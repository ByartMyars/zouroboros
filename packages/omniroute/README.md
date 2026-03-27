# zouroboros-omniroute

> Intelligent OmniRoute integration and model combo selection for Zouroboros

## Features

- **Complexity Analysis**: Analyzes task text using 9 complexity signals
- **Task Type Detection**: Automatically infers task type from keywords
- **Domain Pattern Recognition**: Detects tech stack and subdomain
- **Constraint Handling**: Budget, latency, quality, and speed constraints
- **OmniRoute Integration**: Queries OmniRoute for live combo recommendations
- **Fallback Logic**: Falls back to static tier mapping if OmniRoute unavailable

## Installation

```bash
npm install zouroboros-omniroute
# or
pnpm add zouroboros-omniroute
```

## Quick Start

### Programmatic API

```typescript
import { resolve, resolveQuick } from 'zouroboros-omniroute';

// Quick resolution (static only)
const combo = resolveQuick("Fix the login bug");
console.log(combo); // "swarm-light"

// Full resolution with OmniRoute
const result = await resolve({
  taskText: "Implement a webhook retry system with exponential backoff",
  useOmniRoute: true,
});

console.log(result.resolvedCombo);  // "swarm-mid"
console.log(result.score);          // 0.64
console.log(result.signals);        // Complexity signal breakdown
```

### CLI

```bash
# Basic usage - returns combo name
zouroboros-omniroute "Fix the login bug"
# Output: swarm-light

# With OmniRoute integration
zouroboros-omniroute --omniroute "Implement webhook retry"
# Output: swarm-mid

# Full JSON output
zouroboros-omniroute --omniroute --json "Review the PR"
# Output: { complexity: {...}, omniroute: {...}, resolvedCombo: "..." }

# With constraints
zouroboros-omniroute --budget low --speed high "Quick fix"
```

## Complexity Tiers

| Tier | Score Range | Static Combo | Description |
|------|-------------|--------------|-------------|
| trivial | 0.0 - 0.08 | light | Very simple tasks |
| simple | 0.08 - 0.20 | light | Simple tasks |
| moderate | 0.20 - 0.40 | mid | Moderate complexity |
| complex | 0.40+ | heavy | Complex tasks |

## Supported Task Types

- `coding` - Writing or modifying code
- `review` - Code review, analysis, critique
- `planning` - Architecture, design, roadmap
- `analysis` - Data analysis, research, investigation
- `debugging` - Bug fixing, troubleshooting
- `documentation` - Writing docs, comments, READMEs
- `data_science` - ML, data analysis, models
- `devops` - Infrastructure, deployment, CI/CD
- `security` - Security audits, compliance
- `content` - Blog posts, marketing copy
- `general` - Other tasks

## Configuration

### Environment Variables

```bash
OMNIROUTE_URL=http://localhost:20128    # OmniRoute base URL
OMNIROUTE_API_KEY=your_key_here         # OmniRoute API key
```

### Programmatic Configuration

```typescript
import { OmniRouteClient } from 'zouroboros-omniroute';

const client = new OmniRouteClient({
  baseUrl: 'http://localhost:20128',
  apiKey: 'your_key',
  timeout: 5000,
});
```

## Complexity Signals

The complexity analyzer uses 9 signals:

1. **wordCount** - Number of words in the task
2. **fileRefs** - Number of file references
3. **multiStep** - Indicators of multiple steps
4. **toolUsage** - CLI tools mentioned
5. **analysisDepth** - Analysis keywords
6. **conceptCount** - Distinct technical concepts
7. **taskVerbComplexity** - Action verbs used
8. **scopeBreadth** - Scope indicators (broad vs narrow)
9. **featureListCount** - Feature enumeration

## Constraints

Apply constraints to adjust routing:

- **budget**: `low`, `medium`, `high`
- **latency**: `low`, `medium`, `high`
- **quality**: `low`, `medium`, `high`
- **speed**: `low`, `medium`, `high`

```typescript
const result = await resolve({
  taskText: "Review the PR",
  budget: 'low',
  quality: 'high',
});
```

## License

MIT
