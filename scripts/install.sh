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
    echo "⚠️  Directory $INSTALL_DIR already exists"
    read -p "Update existing installation? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$INSTALL_DIR"
        git pull origin main
    else
        echo "Installation cancelled"
        exit 0
    fi
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "✅ Repository ready"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

echo "✅ Dependencies installed"

# Build packages
echo ""
echo "🔨 Building packages..."
pnpm run build

echo "✅ Build complete"

# Initialize configuration
echo ""
echo "⚙️  Initializing configuration..."

# Create config directory
mkdir -p "$HOME/.zouroboros"

# Create default config if it doesn't exist
if [ ! -f "$HOME/.zouroboros/config.yaml" ]; then
cat > "$HOME/.zouroboros/config.yaml" << 'EOF'
# Zouroboros Configuration

workspace:
  path: /home/workspace

memory:
  dbPath: /home/workspace/.zo/memory/shared-facts.db
  embeddingModel: nomic-embed-text
  ollamaUrl: http://localhost:11434

omniroute:
  url: http://localhost:20128
  apiKey: ${OMNIROUTE_API_KEY}

swarm:
  localConcurrency: 8
  timeoutSeconds: 600
  maxRetries: 3
  routingStrategy: balanced

personas:
  identityDir: /home/workspace/IDENTITY
  agencyAgentsDir: /home/workspace/Skills/agency-agents

logging:
  level: info
  format: json
EOF
    echo "✅ Configuration created at $HOME/.zouroboros/config.yaml"
fi

# Link CLI globally
echo ""
echo "🔗 Linking CLI..."
cd "$INSTALL_DIR/cli"
pnpm link --global 2>/dev/null || true

# Add to PATH if needed
if ! command -v zouroboros &> /dev/null; then
    echo ""
    echo "📝 Adding to PATH..."
    
    SHELL_RC=""
    if [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
    fi
    
    if [ -n "$SHELL_RC" ]; then
        echo "" >> "$SHELL_RC"
        echo "# Zouroboros CLI" >> "$SHELL_RC"
        echo 'export PATH="$PATH:$HOME/zouroboros/cli/bin"' >> "$SHELL_RC"
        echo "✅ Added to $SHELL_RC"
        echo "   Run 'source $SHELL_RC' to apply changes"
    fi
fi

# Run health check
echo ""
echo "🏥 Running health check..."
if command -v zouroboros &> /dev/null; then
    zouroboros doctor || true
else
    echo "⚠️  CLI not in PATH yet. Run 'source ~/.bashrc' or 'source ~/.zshrc' and try:"
    echo "   zouroboros doctor"
fi

# Setup complete
echo ""
echo "🎉 Installation complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Quick start:"
echo "  zouroboros doctor         # Check health"
echo "  zouroboros init           # Initialize project"
echo "  zouroboros memory --help  # Memory commands"
echo "  zouroboros tui            # Launch dashboard"
echo ""
echo "Documentation:"
echo "  https://github.com/marlandoj/zouroboros#readme"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"