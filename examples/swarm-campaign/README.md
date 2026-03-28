# Swarm Campaign Example

> Run a multi-agent orchestration campaign

## Setup

```bash
cd examples/swarm-campaign
zouroboros init
```

## The Campaign

This example creates a simple website with three tasks:
1. **Backend Developer**: Design the API
2. **Frontend Developer**: Build the UI
3. **DevOps Engineer**: Deploy the application

## Running the Campaign

```bash
# Using the CLI
zouroboros swarm run --tasks campaign.json --output ./results

# Or programmatically
bun run index.ts
```

## Campaign Definition

See `campaign.json` for the full task definition with dependencies.

## What's Next?

- Learn about [DAG execution](../../docs/architecture/swarm-orchestration.md#dag)
- Explore [circuit breakers](../../docs/architecture/swarm-orchestration.md#circuit-breakers)
- Try [routing strategies](../../docs/architecture/swarm-orchestration.md#routing)