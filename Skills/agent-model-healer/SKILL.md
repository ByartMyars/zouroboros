---
name: agent-model-healer
description: >
  Zouroboros self-healing watchdog that monitors model health across all scheduled agents.
  When a model fails (402 credits, 429 rate limit, 503 unavailable, timeout), the healer
  automatically switches affected agents to the next healthy fallback model. When the original
  model recovers, it restores agents to their preferred model. Runs as a scheduled watchdog agent.
compatibility: Created for Zo Computer
metadata:
  author: marlandoj.zo.computer
  version: "2.0.0"
  category: zouroboros-infrastructure
---

## Agent Model Healer

Self-healing model fallback system for Zouroboros scheduled agents.

### Problem

Zo scheduled agents are configured with a single model. When that model becomes unavailable
(insufficient credits, rate limits, provider outage), the entire agent task fails silently
with only an email notification. There is no platform-level retry or fallback.

### Solution (v2 — zero-cost orchestration)

A watchdog agent on `zo:fast` runs `healer.ts auto` every 30 minutes. The script is fully autonomous — all orchestration uses **direct MCP API calls** (zero model cost). The only AI cost is the probe prompts (~5 tokens × ~10 models = negligible).

1. **Probe** — Tests all configured models with a tiny prompt via `/zo/ask`
2. **List** — Fetches agents via direct MCP `list_agents` (zero cost)
3. **Heal** — Switches agents on unhealthy models via direct MCP `edit_agent` (zero cost)
4. **Restore** — When original models recover, restores agents to their preferred model
5. **Notify** — Sends email via direct MCP `send_email_to_user` only when actions taken
6. **State** — Tracks all switches in `.zouroboros/healer-state.json` for audit

### Usage

```bash
# Full autonomous pipeline (what the agent runs)
bun Skills/agent-model-healer/scripts/healer.ts auto

# Check model health
bun Skills/agent-model-healer/scripts/healer.ts probe

# See current state
bun Skills/agent-model-healer/scripts/healer.ts status

# Legacy: probe + output instructions (manual use)
bun Skills/agent-model-healer/scripts/healer.ts run
```

### Safety: Watchmen Independence Rule

**The healer agent MUST run on a model that is NOT in any fallback chain it monitors.**

If the healer shares a model with the agents it heals, a single provider outage (e.g., OpenRouter 402 insufficient credits) kills both the healer and its patients — a cascade where nothing can self-repair. The healer runs on **zo:fast** (Zo built-in), which is independent from all external providers it monitors.

This is enforced in `healerConfig` within `assets/fallback-chain.json`.

### Architecture: Why zo:fast + Direct MCP

| Concern | v1 (Zo agent on Sonnet) | v2 (zo:fast + direct MCP) |
|---------|------------------------|---------------------------|
| Agent model cost | 48 Sonnet calls/day | 48 zo:fast calls/day (minimal) |
| Tool call cost | AI interprets JSON → calls tools | Direct HTTP to MCP endpoint (zero) |
| Watchmen safety | Shared provider risk | zo:fast is Zo-native, no external dep |
| Autonomy | Agent interprets instructions | Script executes deterministically |

### Configuration

Edit `assets/fallback-chain.json` to:
- Add/remove models from fallback chains
- Adjust probe timeout and retry settings
- Update model labels for readability
- **Never** add `zo:fast` or `zo:smart` to a fallback chain (healer runs on zo:fast)

### Files

- `scripts/healer.ts` — Main healer engine (auto, probe, diagnose, status, run)
- `assets/fallback-chain.json` — Fallback chain config and model labels
- `/home/workspace/.zouroboros/healer-state.json` — Runtime state (switches, probe results)
- `/dev/shm/agent-model-healer.log` — Operational log

### Watchdog Agent

The healer runs as a scheduled Zo agent (every 30 min) on `zo:fast`. The agent simply executes `bun healer.ts auto` — all logic is in the script, not the AI.
