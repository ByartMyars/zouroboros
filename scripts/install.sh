#!/bin/bash
set -euo pipefail

# Zouroboros Installation Script
# Usage: curl -fsSL .../install.sh | bash

REPO_URL="https://github.com/marlandoj/zouroboros.git"
INSTALL_DIR="${ZOUROBOROS_DIR:-$HOME/zouroboros}"
ZO_WORKSPACE="${ZO_WORKSPACE:-/home/workspace}"

echo "🐍⭕ Zouroboros Installer"
echo "========================"

# Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

# Check for git
if ! command -v git &> /dev/null; then
    echo "❌ Git is required but not installed. Please install Git first."
    exit 1
fi

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "📦 Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "✅ All prerequisites met"

# Clone repository
echo ""
echo "📥 Cloning Zouroboros repository..."
if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory $INSTALL_DIR already exists — updating..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "✅ Repository ready"

# Install dependencies (bin warnings are expected before build creates dist/ files)
echo ""
echo "📦 Installing dependencies..."
pnpm install 2>&1 | grep -v "Failed to create bin" || true

echo "✅ Dependencies installed"

# Build packages
echo ""
echo "🔨 Building packages..."
if ! pnpm run build; then
    echo ""
    echo "❌ Build failed. Common fixes:"
    echo "   1. Run: pnpm -r add -D @types/bun"
    echo "   2. Ensure Bun and pnpm are up to date"
    echo "   3. Check https://github.com/marlandoj/zouroboros/issues"
    exit 1
fi

echo "✅ Build complete"

# Link CLI globally
echo ""
echo "🔗 Linking CLI..."

CLI_ENTRY="$INSTALL_DIR/cli/dist/index.js"

# Strategy: create a wrapper script in /usr/local/bin (always on PATH)
# Falls back to ~/.local/bin if /usr/local/bin is not writable
WRAPPER_SCRIPT='#!/bin/sh
exec bun "'"$CLI_ENTRY"'" "$@"'

LINKED=false

# Try /usr/local/bin first (works for root and sudo installs)
if [ -w /usr/local/bin ] || [ "$(id -u)" = "0" ]; then
    echo "$WRAPPER_SCRIPT" > /usr/local/bin/zouroboros
    chmod +x /usr/local/bin/zouroboros
    LINKED=true
    echo "✅ CLI linked to /usr/local/bin/zouroboros"
fi

# Also link to ~/.local/bin as a backup
mkdir -p "$HOME/.local/bin"
echo "$WRAPPER_SCRIPT" > "$HOME/.local/bin/zouroboros"
chmod +x "$HOME/.local/bin/zouroboros"

if [ "$LINKED" = false ]; then
    LINKED=true
    echo "✅ CLI linked to $HOME/.local/bin/zouroboros"
fi

# Ensure ~/.local/bin is on PATH in all shell configs
for RC_FILE in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$RC_FILE" ]; then
        if ! grep -q 'HOME/.local/bin' "$RC_FILE" 2>/dev/null; then
            echo '' >> "$RC_FILE"
            echo '# Zouroboros CLI' >> "$RC_FILE"
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC_FILE"
        fi
    fi
done

# Verify CLI is reachable in current session
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"
if command -v zouroboros &> /dev/null; then
    echo "✅ CLI verified on PATH"
else
    echo "⚠️  CLI linked but not on PATH in this session."
    echo "   Open a new terminal or run: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# Export skills to Skills directory
echo ""
echo "📦 Exporting skills..."
bash "$INSTALL_DIR/scripts/export-skills.sh" --dest "${ZO_WORKSPACE:-$HOME}/Skills"

# Run full initialization (config + memory DB + Ollama + health check)
echo ""
zouroboros init --force || bun "$CLI_ENTRY" init --force || true

# Check for swarm executors and show prerequisites
echo ""
echo "🔍 Checking swarm executors..."
EXECUTOR_COUNT=0
MISSING_EXECUTORS=""

if command -v claude &> /dev/null; then
    EXECUTOR_COUNT=$((EXECUTOR_COUNT + 1))
else
    MISSING_EXECUTORS="${MISSING_EXECUTORS}\n   npm install -g @anthropic-ai/claude-code    # Claude Code"
fi

if command -v codex &> /dev/null; then
    EXECUTOR_COUNT=$((EXECUTOR_COUNT + 1))
else
    MISSING_EXECUTORS="${MISSING_EXECUTORS}\n   npm install -g @openai/codex                 # Codex CLI"
fi

if command -v gemini &> /dev/null; then
    EXECUTOR_COUNT=$((EXECUTOR_COUNT + 1))
else
    MISSING_EXECUTORS="${MISSING_EXECUTORS}\n   npm install -g @google/gemini-cli             # Gemini CLI"
fi

if command -v hermes &> /dev/null; then
    EXECUTOR_COUNT=$((EXECUTOR_COUNT + 1))
else
    MISSING_EXECUTORS="${MISSING_EXECUTORS}\n   pip install hermes-agent && hermes setup      # Hermes Agent"
fi

if [ "$EXECUTOR_COUNT" -eq 4 ]; then
    echo "✅ All 4 executors available"
elif [ "$EXECUTOR_COUNT" -gt 0 ]; then
    echo "✅ ${EXECUTOR_COUNT}/4 executors available"
    echo ""
    echo "📦 Install missing executors (optional):"
    echo -e "$MISSING_EXECUTORS"
    echo ""
    echo "   Or run: zouroboros doctor --fix"
else
    echo "⚠️  No swarm executors found. Install at least one:"
    echo -e "$MISSING_EXECUTORS"
    echo ""
    echo "   Or run: zouroboros doctor --fix"
fi

# Install ACP adapters
echo ""
echo "🔌 Installing ACP adapters..."
ACP_SCRIPT="$INSTALL_DIR/packages/swarm/scripts/install-acp-adapters.sh"
if [ -f "$ACP_SCRIPT" ]; then
    bash "$ACP_SCRIPT" || echo "⚠️  ACP adapter install encountered issues — run: bash packages/swarm/scripts/install-acp-adapters.sh"
else
    echo "⚠️  ACP adapter script not found at $ACP_SCRIPT — skipping"
fi

# Setup complete
echo ""
echo "🎉 Installation complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Quick start:"
echo "  zouroboros doctor         # Check health"
echo "  zouroboros doctor --fix   # Auto-repair issues"
echo "  zouroboros memory --help  # Memory commands"
echo ""
echo "Documentation:"
echo "  https://github.com/marlandoj/zouroboros#readme"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"