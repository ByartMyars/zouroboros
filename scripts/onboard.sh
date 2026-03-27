#!/bin/bash
set -euo pipefail

echo "🐍⭕ Zouroboros Onboarding"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "${GREEN}✓${NC} $NODE_VERSION"
    else
        echo -e "${YELLOW}⚠${NC} $NODE_VERSION (recommended: >=18)"
    fi
else
    echo -e "${RED}✗${NC} Not installed"
    echo "Please install Node.js >= 18: https://nodejs.org/"
    exit 1
fi

# Check Bun
echo -n "Checking Bun... "
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓${NC} $BUN_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Not installed"
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    echo -e "${GREEN}✓${NC} Bun installed"
fi

# Check Ollama
echo -n "Checking Ollama... "
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Running on localhost:11434"
else
    echo -e "${YELLOW}⚠${NC} Not running"
    echo ""
    echo "Ollama is required for embeddings. To install:"
    echo "  macOS:    brew install ollama"
    echo "  Linux:    curl -fsSL https://ollama.com/install.sh | sh"
    echo "  Docker:   docker run -d -p 11434:11434 ollama/ollama"
    echo ""
    read -p "Continue without Ollama? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies
echo ""
echo -n "Installing dependencies... "
if command -v pnpm &> /dev/null; then
    pnpm install > /dev/null 2>&1
elif command -v npm &> /dev/null; then
    npm install > /dev/null 2>&1
else
    echo -e "${RED}✗${NC} No package manager found (pnpm or npm)"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

# Build packages
echo -n "Building packages... "
if command -v pnpm &> /dev/null; then
    pnpm build > /dev/null 2>&1
else
    npm run build > /dev/null 2>&1
fi
echo -e "${GREEN}✓${NC}"

# Initialize configuration
echo -n "Initializing configuration... "
./cli/bin/zouroboros init --force > /dev/null 2>&1
echo -e "${GREEN}✓${NC}"

echo ""
echo -e "${GREEN}✓ Zouroboros is ready!${NC}"
echo ""
echo "Next steps:"
echo "  ${BLUE}zouroboros doctor${NC}      Check system health"
echo "  ${BLUE}zouroboros config list${NC} View configuration"
echo "  ${BLUE}zouroboros --help${NC}      See all commands"
echo ""
