# zouroboros-workflow

> Spec-first development tools: interview, evaluation, unstuck, and autoloop

## Features

- **Spec-First Interview** — Socratic interview process to clarify requirements before building
- **Three-Stage Evaluation** — Mechanical → Semantic → Consensus verification pipeline
- **Unstuck Lateral** — 5 lateral-thinking personas for breaking through stagnation
- **Autoloop** — Autonomous single-metric optimization with git-based improvement tracking

## Installation

```bash
npm install zouroboros-workflow
# or
pnpm add zouroboros-workflow
```

## CLI Usage

### Spec-First Interview

```bash
# Score ambiguity of a request
zouroboros-interview score --request "Make the site faster"

# Generate seed specification
zouroboros-interview seed --topic "Build a webhook retry system"

# Interactive interview guide
zouroboros-interview --topic "Your topic here"
```

### Three-Stage Evaluation

```bash
# Run full evaluation pipeline
zouroboros-evaluate --seed seed.yaml --artifact ./src/

# Run only mechanical checks
zouroboros-evaluate --seed seed.yaml --artifact ./src/ --stage 1

# Self-test current workspace
zouroboros-evaluate --self-test
```

### Unstuck Lateral

```bash
# Auto-select persona based on problem
zouroboros-unstuck --problem "The API keeps returning 403 errors"

# Use specific persona
zouroboros-unstuck --problem "This refactor touches 20 files" --persona architect

# List all personas
zouroboros-unstuck --list
```

### Autoloop

```bash
# Validate program configuration
zouroboros-autoloop --program ./program.md --dry-run

# Run optimization loop
zouroboros-autoloop --program ./program.md

# Resume from existing branch
zouroboros-autoloop --program ./program.md --resume
```

## Programmatic API

### Spec-First Interview

```typescript
import { scoreAmbiguity, generateSeedTemplate } from 'zouroboros-workflow';

// Score ambiguity before building
const score = scoreAmbiguity("Build a webhook retry system");
console.log(score.ambiguity); // 0.35 (needs clarification)
console.log(score.assessment); // "NEEDS CLARIFICATION"

// Generate seed after interview
const seed = generateSeedTemplate("Webhook Retry System", "./interview-notes.md");
```

### Three-Stage Evaluation

```typescript
import { parseSeed, runMechanicalChecks, evaluateSemantic } from 'zouroboros-workflow';

// Parse seed specification
const seed = parseSeed('./seed.yaml');

// Stage 1: Mechanical verification
const checks = runMechanicalChecks('./src/');
// [ { name: 'TypeScript compile', passed: true, detail: 'No errors' }, ... ]

// Stage 2: Semantic evaluation
const result = evaluateSemantic(seed, './src/');
console.log(result.overallScore); // 0.85
console.log(result.decision); // 'APPROVED' | 'NEEDS_WORK'
```

### Unstuck Lateral

```typescript
import { autoSelectPersona, getStrategy } from 'zouroboros-workflow';

// Auto-select best persona
const selection = autoSelectPersona("I'm stuck on this API error");
console.log(selection.persona); // 'hacker'
console.log(selection.confidence); // 0.85

// Get strategy details
const strategy = getStrategy('hacker');
console.log(strategy.philosophy);
console.log(strategy.approach);
```

### Autoloop

```typescript
import { parseProgram, initState, shouldContinue, runExperiment } from 'zouroboros-workflow';

// Parse program configuration
const config = parseProgram('./program.md');

// Initialize loop
const state = initState(config, 'autoloop/my-optimization');

// Run loop
while (shouldContinue(state, config).continue) {
  // Propose change via AI executor
  // Apply change to target file
  // Git commit
  
  // Run experiment
  const result = await runExperiment(config, './');
  
  // Decide keep or revert
  if (result.metric !== null) {
    // Update state, commit or revert
  }
}
```

## License

MIT
