#!/usr/bin/env bash
# Hermes bridge script — invokes Hermes CLI in single-query mode
# Strips banner/chrome, returns only the response text
#
# Usage:
#   ./hermes-bridge.sh "Your prompt here"
#   ./hermes-bridge.sh "Your prompt here" /path/to/workdir
#
# Environment:
#   HERMES_PROJECT_DIR — path to hermes-agent project (default: /home/workspace/hermes-agent)
#   HERMES_VENV        — path to venv activate script (default: $HERMES_PROJECT_DIR/.venv/bin/activate)
#   HERMES_TIMEOUT     — timeout in seconds (default: 300)

set -euo pipefail

PROMPT="${1:?Usage: hermes-bridge.sh \"prompt\" [workdir]}"
WORKDIR="${2:-/home/workspace}"
PROJECT_DIR="${HERMES_PROJECT_DIR:-/home/workspace/hermes-agent}"
VENV_ACTIVATE="${HERMES_VENV:-$PROJECT_DIR/.venv/bin/activate}"

# Priority: SWARM_RESOLVED_MODEL > LLM_MODEL
RAW_MODEL="${SWARM_RESOLVED_MODEL:-${LLM_MODEL:-}}"
TIER="${SWARM_TIER:-}"

# --- Per-tier timeout resolution ---
if [ -n "${HERMES_TIMEOUT:-}" ]; then
  TIMEOUT="$HERMES_TIMEOUT"
else
  case "${TIER:-}" in
    trivial|swarm-light)          TIMEOUT=120 ;;
    simple|moderate|swarm-mid)    TIMEOUT=300 ;;
    complex|swarm-heavy)          TIMEOUT=600 ;;
    *)                            TIMEOUT=300 ;;
  esac
fi

export LLM_MODEL="${RAW_MODEL:-}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: Hermes project dir not found: $PROJECT_DIR" >&2
  exit 1
fi

if [ ! -f "$VENV_ACTIVATE" ]; then
  echo "ERROR: Hermes venv not found: $VENV_ACTIVATE" >&2
  exit 1
fi

cd "$PROJECT_DIR"
source "$VENV_ACTIVATE"

# --- Spec 2: Capture start time for duration metrics ---
START_TIME=$(date +%s%N)

STDERR_LOG="/tmp/hermes-bridge-stderr-$$.log"
OUTPUT_FILE="/tmp/hermes-bridge-output-$$.txt"

# Run Hermes in quiet single-query mode, strip banner chrome
timeout "$TIMEOUT" python cli.py -q "$PROMPT" 2>"$STDERR_LOG" \
  | sed -n '/^╭─ ⚕ Hermes/,/^╰──/p' \
  | sed '1d;$d' \
  | sed 's/\r//g' \
  | sed '/^$/d' > "$OUTPUT_FILE"
EXIT_CODE=${PIPESTATUS[0]}

# Helper: write failure result.json
_write_failure_result() {
  local _EXIT=$1
  local _STDERR_MSG="$2"
  local _RESULT_FILE="${RESULT_PATH:-result.json}"
  local _RESULT_TMP="${_RESULT_FILE}.tmp"
  local _TASK_ID="${SWARM_TASK_ID:-unknown}"
  local _TIMESTAMP
  _TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local _DURATION_MS=0
  if [ -n "${START_TIME:-}" ]; then
    local _END_TIME
    _END_TIME=$(date +%s%N)
    _DURATION_MS=$(( (_END_TIME - START_TIME) / 1000000 ))
  fi
  cat > "$_RESULT_TMP" <<RESULT_EOF
{
  "status": "failure",
  "output": "",
  "error": {
    "category": "unknown",
    "message": $(echo "$_STDERR_MSG" | head -c 2000 | jq -Rs .),
    "retryable": true
  },
  "metrics": {
    "durationMs": $_DURATION_MS,
    "model": $(echo "${LLM_MODEL:-default}" | jq -Rs .)
  },
  "executorId": "hermes",
  "taskId": "$_TASK_ID",
  "timestamp": "$_TIMESTAMP"
}
RESULT_EOF
  mv "$_RESULT_TMP" "$_RESULT_FILE"
}

if [ $EXIT_CODE -ne 0 ]; then
  echo "BRIDGE_ERROR: exit=$EXIT_CODE tier=${TIER:-unknown} timeout=${TIMEOUT}s model=${LLM_MODEL:-default} stderr=$(head -5 "$STDERR_LOG" 2>/dev/null)" >&2
  _write_failure_result "$EXIT_CODE" "$(head -5 "$STDERR_LOG" 2>/dev/null)"
  rm -f "$STDERR_LOG" "$OUTPUT_FILE"
  exit $EXIT_CODE
fi

# Safety check: if sed pipeline stripped everything, fall back to raw output
if [ ! -s "$OUTPUT_FILE" ]; then
  echo "BRIDGE_WARN: banner parsing returned empty output, retrying with raw capture" >&2
  timeout "$TIMEOUT" python cli.py -q "$PROMPT" 2>/dev/null > "$OUTPUT_FILE"
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "BRIDGE_ERROR: raw retry failed, exit=$EXIT_CODE tier=${TIER:-unknown} timeout=${TIMEOUT}s model=${LLM_MODEL:-default}" >&2
    _write_failure_result "$EXIT_CODE" "raw retry failed, exit=$EXIT_CODE"
    rm -f "$STDERR_LOG" "$OUTPUT_FILE"
    exit $EXIT_CODE
  fi
fi

cat "$OUTPUT_FILE"

# --- Structured Result Output (Spec 2) ---
RESULT_FILE="${RESULT_PATH:-result.json}"
RESULT_TMP="${RESULT_FILE}.tmp"
TASK_ID="${SWARM_TASK_ID:-unknown}"
EXECUTOR_ID="hermes"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RESOLVED_MODEL="${LLM_MODEL:-default}"

if [ -n "$START_TIME" ]; then
  END_TIME=$(date +%s%N)
  DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
else
  DURATION_MS=0
fi

STDERR_OUTPUT=$(head -c 2000 "$STDERR_LOG" 2>/dev/null || true)

cat > "$RESULT_TMP" <<RESULT_EOF
{
  "status": "success",
  "output": $(cat "$OUTPUT_FILE" 2>/dev/null | head -c 102400 | jq -Rs .),
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

rm -f "$STDERR_LOG" "$OUTPUT_FILE"
exit 0
