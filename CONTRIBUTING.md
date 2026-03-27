# Contributing to Zouroboros

Thank you for your interest in contributing to Zouroboros! This document provides guidelines for contributing.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/marlandoj/zouroboros.git
cd zouroboros

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Project Structure

```
zouroboros/
├── packages/          # Core packages
│   ├── core/         # Shared types and config
│   ├── memory/       # Memory system
│   ├── swarm/        # Swarm orchestration
│   ├── personas/     # Persona management
│   └── selfheal/     # Self-healing system
├── cli/              # Command-line interface
├── plugins/          # Optional plugins
├── docs/             # Documentation
└── scripts/          # Utility scripts
```

## Making Changes

1. Create a new branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Add tests if applicable
4. Run linting: `pnpm lint`
5. Run type checking: `pnpm typecheck`
6. Commit with a clear message
7. Push and create a PR

## Commit Messages

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Maintenance tasks

Example:
```
feat(memory): add graph-boosted search

Implements relationship-aware search that combines
semantic similarity with graph connectivity.
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add a changeset if the change is user-facing: `pnpm changeset`
4. Request review from maintainers
5. Address feedback
6. Merge will be handled by maintainers

## Code Style

- TypeScript strict mode enabled
- 2-space indentation
- Semicolons required
- Single quotes for strings
- Max line length: 100 characters

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter zouroboros-memory test

# Run tests in watch mode
pnpm test --watch
```

## Questions?

Open an issue or reach out to the maintainers.
