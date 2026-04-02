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

`zouroboros doctor` checks a local marker file (`~/.zouroboros/agents-registered.json`) to verify agents have been created. After creating agents in Zo Chat, run:

```bash
zouroboros agents sync
```

This writes the marker so `doctor` reports them as registered.

## Updating an Agent

1. Edit the spec in `manifest.json`
2. Use `edit_agent` in Zo Chat to sync the change to the platform
3. Commit the manifest update

The manifest is not auto-deployed — it's a reference that keeps agent configs version-controlled.
