# Zouroboros Scheduled Agents

Declarative specs for the Zo Computer agents that power the Zouroboros memory and self-enhancement pipeline.

These agents run on the Zo platform (`create_agent` / `edit_agent`). This directory is the **source of truth** for their configuration — `zouroboros doctor` verifies they are registered and active.

## Daily Pipeline (America/Phoenix)

```
03:15  Memory Embedding Backfill   ─┐
                                     │  packages/memory
04:00  Memory Capture Daily Report ─┤
                                     │
05:00  Unified Decay System        ─┘
                                     │
05:15  Self-Enhancement Summary    ── packages/selfheal
                                     │  (reads decay output)
 ──────────────────────────────────
hourly Vault Indexer               ── packages/memory (vault)
```

### Dependency Chain

```
embedding-backfill → memory-capture → unified-decay → self-enhancement-summary
vault-indexer (independent, hourly)
```

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Agent specs: IDs, schedules, commands, instructions, dependencies |
| `README.md` | This file |

## Doctor Integration

`zouroboros doctor` reads `manifest.json` and checks each agent's `zo_id` against the Zo platform. It reports:

- **ok** — Agent is registered and active
- **warning** — Agent exists but is paused/inactive
- **error** — Agent not found on the platform

## Updating an Agent

1. Edit the spec in `manifest.json`
2. Use `edit_agent` on the Zo platform with the `zo_id` to sync the change
3. Commit both the manifest update and confirm the platform change

The manifest is not auto-deployed — it's a reference that keeps agent configs version-controlled and verifiable.
