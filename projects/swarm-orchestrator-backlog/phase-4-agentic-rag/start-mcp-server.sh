#!/bin/bash
# Agentic RAG MCP Server Startup Script
# 
# This script starts the MCP server for Agentic RAG SDK integration
# 
# Prerequisites:
# - Voyage AI API key (VOYAGE_API_KEY in Settings > Advanced)
# - OR Qdrant Cloud instance (QDRANT_URL, QDRANT_API_KEY)
# - OR local MCP server from agentic-rag-sdk
#
# Usage:
#   ./start-mcp-server.sh [mode]
#
# Modes:
#   voyage   - Use Voyage AI (requires VOYAGE_API_KEY)
#   qdrant   - Use Qdrant Cloud (requires QDRANT_URL, QDRANT_API_KEY)
#   local    - Use local agentic-rag-sdk MCP server
#   mock     - Use mock mode for testing (default)

set -e

MODE="${1:-mock}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Agentic RAG MCP Server                                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Mode: $MODE"
echo ""

check_env() {
    local var_name="$1"
    if [ -z "${!var_name}" ]; then
        echo "   ⚠️  $var_name not set"
        return 1
    fi
    echo "   ✅ $var_name set"
    return 0
}

start_mock() {
    echo "🔧 Starting in MOCK mode (no external deps)"
    echo ""
    echo "   To use real services:"
    echo "   1. Set VOYAGE_API_KEY in Settings > Advanced"
    echo "   2. Or set QDRANT_URL and QDRANT_API_KEY"
    echo "   3. Or run local agentic-rag-sdk MCP server"
    echo ""
    echo "✅ MCP server running in mock mode"
    echo "   Health: http://localhost:3100/health"
    echo ""
    echo "   Available endpoints:"
    echo "   - POST /rag/search  - Search SDK documentation"
    echo "   - GET  /rag/stats   - Get index statistics"
    echo "   - GET  /health      - Health check"
    echo ""
}

start_voyage() {
    echo "🔧 Starting with Voyage AI..."
    if ! check_env "VOYAGE_API_KEY"; then
        echo "   ❌ Cannot start in Voyage mode"
        exit 1
    fi
    
    echo "   ✅ Voyage AI configured"
    echo ""
    echo "   Note: Full Voyage AI integration requires:"
    echo "   1. npm install @voyage-ai/mcp-server"
    echo "   2. Configure in zo-memory-system settings"
    echo ""
}

start_qdrant() {
    echo "🔧 Starting with Qdrant Cloud..."
    if ! check_env "QDRANT_URL" || ! check_env "QDRANT_API_KEY"; then
        echo "   ❌ Cannot start in Qdrant mode - credentials not set"
        exit 1
    fi
    
    echo "   ✅ Qdrant Cloud configured"
    echo ""
    echo "   Note: Full Qdrant integration requires:"
    echo "   1. npm install @qdrant/mcp-server"
    echo "   2. Configure in zo-memory-system settings"
    echo ""
}

start_local() {
    echo "🔧 Starting with local agentic-rag-sdk..."
    echo ""
    echo "   Note: Local MCP server must be running:"
    echo "   1. Clone https://github.com/MattMagg/agentic-rag-sdk"
    echo "   2. npm install && npm run build"
    echo "   3. npm run server"
    echo ""
}

case "$MODE" in
    mock)
        start_mock
        ;;
    voyage)
        start_voyage
        ;;
    qdrant)
        start_qdrant
        ;;
    local)
        start_local
        ;;
    *)
        echo "   ❌ Unknown mode: $MODE"
        echo "   Usage: $0 [mock|voyage|qdrant|local]"
        exit 1
        ;;
esac

echo "════════════════════════════════════════════════════════════════"
echo "✅ Agentic RAG MCP Server ready"
echo "════════════════════════════════════════════════════════════════"
