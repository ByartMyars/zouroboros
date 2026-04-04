#!/usr/bin/env bash
# Codex CLI bridge script — invokes Codex CLI in one-shot mode
# Returns only the response text, suitable for scripted/orchestrator invocation
#
# Usage:
#   ./codex-bridge.sh "Your prompt here"
#   ./codex-bridge.sh "Your prompt here" /path/to/workdir
#
# Environment:
#   CODEX_MODEL   — override model (e.g., o3)
#   CODEX_TIMEOUT — timeout in seconds (default: 300)

set -euo pipefail

PROMPT="${1:?Usage: codex-bridge.sh \"prompt\" [workdir]}"
WORKDIR="${2:-/home/workspace}"

# Load secrets for MCP servers
if [ -f "$HOME/.zo_secrets" ]; then
  source "$HOME/.zo_secrets"
fi

# Priority: SWARM_RESOLVED_MODEL > CODEX_MODEL > CLI default
RAW_MODEL="${SWARM_RESOLVED_MODEL:-${CODEX_MODEL:-}}"
TIER="${SWARM_TIER:-}"

# --- Per-tier timeout resolution ---
if [ -n "${CODEX_TIMEOUT:-}" ]; then
  TIMEOUT="$CODEX_TIMEOUT"
else
  case "${TIER:-}" in
    trivial|swarm-light)          TIMEOUT=120 ;;
    simple|moderate|swarm-mid)    TIMEOUT=300 ;;
    complex|swarm-heavy)          TIMEOUT=600 ;;
    *)                            TIMEOUT=300 ;;
  esac
fi

# Static fallback: map swarm tier names to Codex model aliases
# swarm-light    → gpt-5.1-codex-mini (fast, cheap)
# swarm-mid      → gpt-5.3-codex     (balanced)
# swarm-heavy    → gpt-5.4           (frontier)
# swarm-failover → gpt-5.1-codex-mini
case "$RAW_MODEL" in
  swarm-light)    CODEX_MODEL="gpt-5.1-codex-mini" ;;
  swarm-mid)      CODEX_MODEL="gpt-5.3-codex" ;;
  swarm-heavy)    CODEX_MODEL="gpt-5.4" ;;
  swarm-failover) CODEX_MODEL="gpt-5.1-codex-mini" ;;
  swarm-*)        CODEX_MODEL="gpt-5.1-codex-mini" ;;
  light)          CODEX_MODEL="gpt-5.1-codex-mini" ;;
  mid)            CODEX_MODEL="gpt-5.3-codex" ;;
  heavy)          CODEX_MODEL="gpt-5.4" ;;
  failover)       CODEX_MODEL="gpt-5.1-codex-mini" ;;
  *)              CODEX_MODEL="$RAW_MODEL" ;;
esac

# Resolve codex binary — check PATH
CODEX_BIN="${CODEX_BIN:-}"
if [ -z "$CODEX_BIN" ]; then
  if command -v codex &>/dev/null; then
    CODEX_BIN="codex"
  else
    echo "ERROR: codex binary not found. Install with: npm install -g @openai/codex" >&2
    exit 1
  fi
fi

cd "$WORKDIR"

# --- Spec 2: Capture start time for duration metrics ---
START_TIME=$(date +%s%N)

# Log stderr for debugging; stdout is the response
STDERR_LOG="/tmp/codex-bridge-stderr-$$.log"
OUT_FILE="/tmp/codex-bridge-out-$$.log"

EXTRA_ARGS=""
if [ -n "${CODEX_MODEL:-}" ]; then
  EXTRA_ARGS="--model $CODEX_MODEL"
fi

# Run codex non-interactively
# --dangerously-bypass-approvals-and-sandbox enables execution of shell commands without asking
# --output-last-message ensures we can just read the final response from the file
timeout "$TIMEOUT" "$CODEX_BIN" exec --dangerously-bypass-approvals-and-sandbox --color never $EXTRA_ARGS --output-last-message "$OUT_FILE" "$PROMPT" </dev/null 2>"$STDERR_LOG" >/dev/null
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  if [ -f "$OUT_FILE" ]; then
    cat "$OUT_FILE"
  fi
else
  echo "BRIDGE_ERROR: exit=$EXIT_CODE tier=${TIER:-unknown} timeout=${TIMEOUT}s model=${CODEX_MODEL:-default} stderr=$(head -5 "$STDERR_LOG" 2>/dev/null)" >&2
fi

# --- Structured Result Output (Spec 2) ---
RESULT_FILE="${RESULT_PATH:-result.json}"
RESULT_TMP="${RESULT_FILE}.tmp"
TASK_ID="${SWARM_TASK_ID:-unknown}"
EXECUTOR_ID="codex"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RESOLVED_MODEL="${CODEX_MODEL:-default}"

if [ -n "$START_TIME" ]; then
  END_TIME=$(date +%s%N)
  DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
else
  DURATION_MS=0
fi

STDERR_OUTPUT=$(head -c 2000 "$STDERR_LOG" 2>/dev/null || true)

if [ $EXIT_CODE -eq 0 ]; then
  cat > "$RESULT_TMP" <<RESULT_EOF
{
  "status": "success",
  "output": $(cat "$OUT_FILE" 2>/dev/null | head -c 102400 | jq -Rs .),
  "metrics": {
    "durationMs": $DURATION_MS,
    "model": $(echo "$RESOLVED_MODEL" | jq -Rs .)
  },
  "executorId": "$EXECUTOR_ID",
  "taskId": "$TASK_ID",
  "timestamp": "$TIMESTAMP"
}
RESULT_EOF
  mv "$RESULT_TMP" "$RESULT_FILE"
else
  cat > "$RESULT_TMP" <<RESULT_EOF
{
  "status": "failure",
  "output": "",
  "error": {
    "category": "unknown",
    "message": $(echo "$STDERR_OUTPUT" | jq -Rs .),
    "retryable": true
  },
  "executorId": "$EXECUTOR_ID",
  "taskId": "$TASK_ID",
  "timestamp": "$TIMESTAMP"
}
RESULT_EOF
  mv "$RESULT_TMP" "$RESULT_FILE"
fi

rm -f "$STDERR_LOG" "$OUT_FILE"
exit $EXIT_CODE
