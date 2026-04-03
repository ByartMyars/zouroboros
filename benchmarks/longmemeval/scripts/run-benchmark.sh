#!/bin/bash
# LongMemEval Benchmark Runner for Zouroboros Memory System
# Usage: ./run-benchmark.sh [--limit N] [--no-vector] [--skip-eval]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCH_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BENCH_DIR/data"
RESULTS_DIR="$BENCH_DIR/results"
EVAL_DIR="$BENCH_DIR/eval/src/evaluation"

DATASET="$DATA_DIR/longmemeval_oracle.json"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="$RESULTS_DIR/run_$TIMESTAMP"

LIMIT=""
NO_VECTOR=""
SKIP_EVAL=""
VERBOSE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --limit) LIMIT="--limit $2"; shift 2 ;;
    --no-vector) NO_VECTOR="--no-vector"; shift ;;
    --skip-eval) SKIP_EVAL="1"; shift ;;
    --verbose|-v) VERBOSE="--verbose"; shift ;;
    --dataset) DATASET="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$RUN_DIR"

echo "╔═══════════════════════════════════════════════════════╗"
echo "║  LongMemEval Benchmark — Zouroboros Memory System    ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Run ID: $TIMESTAMP                        ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
if ! command -v bun &>/dev/null; then
  echo "ERROR: bun is not installed"; exit 1
fi
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "ERROR: Ollama is not running at localhost:11434"; exit 1
fi
echo "  ✓ bun $(bun --version)"
echo "  ✓ Ollama running"
echo ""

# Phase 1: Ingest + Query
echo "Phase 1: Ingest & Query"
echo "─────────────────────────────────────────"
DB_PATH="$RUN_DIR/benchmark.db"

cd "$BENCH_DIR"
bun scripts/adapter.ts \
  --dataset "$DATASET" \
  --output "$RUN_DIR/hypothesis.jsonl" \
  --retrieval-only "$RUN_DIR/retrieval.jsonl" \
  --db-path "$DB_PATH" \
  $LIMIT $NO_VECTOR $VERBOSE \
  2>&1 | tee "$RUN_DIR/adapter.log"

echo ""

# Phase 2: Evaluate with GPT-4o judge
if [[ -z "$SKIP_EVAL" ]]; then
  echo "Phase 2: GPT-4o Evaluation"
  echo "─────────────────────────────────────────"
  
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "WARNING: OPENAI_API_KEY not set. Skipping GPT-4o evaluation."
    echo "  Set it and run manually:"
    echo "    export OPENAI_API_KEY=your_key"
    echo "    python3 $EVAL_DIR/evaluate_qa.py gpt-4o $RUN_DIR/hypothesis.jsonl $DATASET"
    echo "    python3 $EVAL_DIR/print_qa_metrics.py $RUN_DIR/hypothesis.jsonl.eval-results-gpt-4o $DATASET"
  else
    cd "$EVAL_DIR"
    python3 evaluate_qa.py gpt-4o "$RUN_DIR/hypothesis.jsonl" "$DATASET" 2>&1 | tee "$RUN_DIR/eval.log"
    
    echo ""
    echo "Phase 3: Metrics Summary"
    echo "─────────────────────────────────────────"
    python3 print_qa_metrics.py "$RUN_DIR/hypothesis.jsonl.eval-results-gpt-4o" "$DATASET" 2>&1 | tee "$RUN_DIR/metrics.txt"
  fi
else
  echo "Evaluation skipped (--skip-eval)"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Run complete: $RUN_DIR"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "Artifacts:"
echo "  hypothesis.jsonl    — Model answers"
echo "  retrieval.jsonl     — Retrieved session IDs + scores"
echo "  adapter.log         — Ingestion/query log"
echo "  benchmark.db        — Snapshot of memory DB"
if [[ -z "$SKIP_EVAL" ]] && [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "  eval.log            — GPT-4o judge log"
  echo "  metrics.txt         — Final accuracy scores"
fi
