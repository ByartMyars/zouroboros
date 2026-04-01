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

# Ensure PNPM_HOME is configured (fixes ERR_PNPM_NO_GLOBAL_BIN_DIR)
if [ -z "${PNPM_HOME:-}" ]; then
    export PNPM_HOME="$HOME/.local/share/pnpm"
    mkdir -p "$PNPM_HOME"
fi

# Add PNPM_HOME and local bin to PATH for this session
export PATH="$PNPM_HOME:$HOME/.local/bin:$PATH"

cd "$INSTALL_DIR/cli"
if pnpm link --global 2>/dev/null; then
    echo "✅ CLI linked globally"
else
    echo "⚠️  pnpm link --global failed — falling back to direct symlink"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$INSTALL_DIR/cli/dist/index.js" "$HOME/.local/bin/zouroboros"
    chmod +x "$HOME/.local/bin/zouroboros"
fi

# Persist PNPM_HOME and PATH additions to shell profile
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "PNPM_HOME" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# pnpm global bin directory" >> "$SHELL_RC"
        echo "export PNPM_HOME=\"\$HOME/.local/share/pnpm\"" >> "$SHELL_RC"
        echo 'export PATH="$PNPM_HOME:$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    fi
fi

# Verify CLI is reachable
if ! command -v zouroboros &> /dev/null; then
    echo ""
    echo "📝 CLI not yet on PATH for this session."
    if [ -n "$SHELL_RC" ]; then
        echo "   Run 'source $SHELL_RC' to apply changes, then try: zouroboros doctor"
    fi
fi

# Run full initialization (config + memory DB + Ollama + health check)
echo ""
if command -v zouroboros &> /dev/null; then
    zouroboros init --force || true
elif [ -x "$HOME/.local/bin/zouroboros" ]; then
    "$HOME/.local/bin/zouroboros" init --force || true
elif [ -f "$INSTALL_DIR/cli/dist/index.js" ]; then
    bun "$INSTALL_DIR/cli/dist/index.js" init --force || true
else
    echo "⚠️  CLI not found — skipping auto-init."
    echo "   After adding CLI to PATH, run: zouroboros init"
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
echo "  zouroboros tui            # Launch dashboard"
echo ""
echo "Documentation:"
echo "  https://github.com/marlandoj/zouroboros#readme"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"