# Zouroboros Memory Benchmarks

Benchmark evaluation harness for the Zouroboros Memory System.
Runs standard AI memory benchmarks against the hybrid search engine.

## Supported Benchmarks

| Benchmark | Source | Focus | Status |
|-----------|--------|-------|--------|
| **LongMemEval** | ICLR 2025 / xiaowu0162 | 5 memory abilities across conversation history | **80%** (vs Supermemory 81.6%) |
| **ConvoMem** | Salesforce AI Research | 6 categories × 15 context sizes | **86.67%** (3 categories tested) |

## Quick Start

### LongMemEval

```bash
# Download dataset
cd benchmarks/longmemeval/data
# Place longmemeval_oracle.json or longmemeval_s_cleaned.json here

# Run benchmark (FTS-only, fast)
cd benchmarks/longmemeval
bun scripts/adapter.ts --dataset data/longmemeval_oracle.json --output results/hypothesis.jsonl --no-vector

# Run with hybrid search
bun scripts/adapter.ts --dataset data/longmemeval_oracle.json --output results/hypothesis.jsonl

# Evaluate with GPT-4o judge
cd eval && python3 src/evaluation/evaluate_qa.py gpt-4o ../results/hypothesis.jsonl ../data/longmemeval_oracle.json
```

### ConvoMem

```bash
# Download dataset
cd benchmarks/convomem/data
# Place core_benchmark/ directory here

# Run benchmark
cd benchmarks/convomem
bun scripts/adapter.ts --dataset data/core_benchmark --output results/ --limit 5 --context-sizes 5,20

# FTS-only (fast testing)
bun scripts/adapter.ts --dataset data/core_benchmark --output results/ --no-vector --limit 3
```

## Architecture

Both adapters use the Zouroboros memory system via direct imports:

```
benchmarks/
├── README.md
├── longmemeval/
│   ├── scripts/adapter.ts    # v2: turn-level chunking, session expansion
│   ├── scripts/run-benchmark.sh
│   ├── eval/                  # Official LongMemEval evaluation toolkit
│   ├── data/                  # Datasets (gitignored)
│   └── results/               # Run outputs (gitignored)
└── convomem/
    ├── scripts/adapter.ts     # Turn-level chunking, filler handling
    ├── data/                  # Datasets (gitignored)
    └── results/               # Run outputs (gitignored)
```

## Key Optimizations (v2)

1. **Turn-level chunking** — Each user+assistant pair stored as a single fact instead of 500-char sliding windows. Concentrates BM25/vector signal for precise retrieval.

2. **Session expansion** — After finding matched chunks, pulls ±2 adjacent turns from the top-3 matched sessions. Ensures multi-turn answers aren't missed.

3. **FTS-primary hybrid** — BM25 keyword matches ranked above vector-only results. Vector similarity can surface topically similar but factually wrong sessions; this keeps it supplementary.

4. **Assertive answer prompt** — Short, direct extraction instruction instead of over-cautious "say I don't know" language that caused false abstention.

## Requirements

- Bun runtime
- Ollama with `nomic-embed-text` and `qwen2.5:7b` models
- Zouroboros memory system (packages/memory)
- For GPT-4o judge: `OPENAI_API_KEY` env var

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `ZO_ANSWER_MODEL` | `qwen2.5:7b` | Answer generation model |
| `ZO_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `OPENAI_API_KEY` | — | Required for GPT-4o judge |
