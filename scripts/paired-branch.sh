#!/bin/bash
#
# Paired Branch Workflow for Zouroboros Multi-Repo Development
# 
# Usage: ./paired-branch.sh <feature-name> [repo1,repo2,...]
#
# Examples:
#   ./paired-branch.sh swarm-cascade-fix
#   ./paired-branch.sh memory-hyde zo-memory-system,zo-swarm-orchestrator
#   ./paired-branch.sh --list-repos
#

set -euo pipefail

# Configuration
MONOREPO_NAME="Zouroboros"
MONOREPO_PATH="${ZOUROBOROS_MONOREPO:-$HOME/workspace/Zouroboros}"
REPOS_ROOT="${ZOUROBOROS_REPOS:-$HOME/workspace}"

# All ecosystem repos that may need paired branches
ALL_REPOS=(
    "zo-swarm-orchestrator"
    "zo-memory-system"
    "zo-executors"
    "zo-persona-creator"
    "zo-vault"
    "zo-code-server-setup"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

list_repos() {
    echo "Zouroboros Ecosystem Repos:"
    echo ""
    echo "Monorepo (target): $MONOREPO_NAME"
    echo ""
    echo "Individual repos (sources):"
    for repo in "${ALL_REPOS[@]}"; do
        echo "  - $repo"
    done
    echo ""
    echo "To add more repos, edit ALL_REPOS in this script."
}

validate_environment() {
    local missing=()
    
    if [[ ! -d "$MONOREPO_PATH/.git" ]]; then
        missing+=("Monorepo not found at $MONOREPO_PATH")
    fi
    
    for repo in "${TARGET_REPOS[@]}"; do
        if [[ ! -d "$REPOS_ROOT/$repo/.git" ]]; then
            missing+=("Repo not found: $REPOS_ROOT/$repo")
        fi
    done
    
    if ! command -v gh &> /dev/null; then
        missing+=("GitHub CLI (gh) not installed. Install: https://cli.github.com/")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Environment validation failed:"
        for msg in "${missing[@]}"; do
            echo "  - $msg"
        done
        exit 1
    fi
}

create_branch() {
    local repo_path="$1"
    local branch_name="$2"
    local repo_name=$(basename "$repo_path")
    
    log_info "Creating branch $branch_name in $repo_name..."
    
    cd "$repo_path"
    
    # Ensure we're on main and up to date
    git checkout main 2>/dev/null || git checkout master 2>/dev/null || true
    git pull origin HEAD 2>/dev/null || log_warn "Could not pull latest for $repo_name"
    
    # Create or checkout branch
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        log_warn "Branch $branch_name already exists in $repo_name, checking it out..."
        git checkout "$branch_name"
    else
        git checkout -b "$branch_name"
        log_success "Created branch $branch_name in $repo_name"
    fi
}

get_default_branch() {
    local repo_path="$1"
    cd "$repo_path"
    git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}' || echo "main"
}

print_dependency_order() {
    echo ""
    echo "========================================"
    echo "  PAIRED BRANCH WORKFLOW"
    echo "========================================"
    echo ""
    echo "Feature: $BRANCH_NAME"
    echo ""
    echo "Dependency Order for PR Merges:"
    echo "───────────────────────────────────────"
    
    local i=1
    for repo in "${TARGET_REPOS[@]}"; do
        echo "$i. $repo (source)"
        ((i++))
    done
    echo "$i. $MONOREPO_NAME (monorepo - FINAL)"
    echo ""
    echo "========================================"
    echo ""
}

print_pr_template() {
    local repo="$1"
    local is_monorepo="$2"
    
    echo ""
    echo "========================================"
    echo "  PR TEMPLATE for $repo"
    echo "========================================"
    echo ""
    echo "Title: feat: [DESCRIPTION]"
    echo ""
    echo "## Summary"
    echo "[Brief description of changes]"
    echo ""
    echo "## Related PRs"
    echo "- Paired branch: \`$BRANCH_NAME\`"
    
    if [[ "$is_monorepo" == "true" ]]; then
        echo "- Depends on:"
        for r in "${TARGET_REPOS[@]}"; do
            echo "  - $r PR #[NUMBER]"
        done
        echo ""
        echo "## Merge Order"
        echo "⚠️  MERGE THIS LAST after all dependent PRs are merged ⚠️"
    else
        echo "- Blocks: $MONOREPO_NAME PR #[NUMBER]"
        echo ""
        echo "## Merge Order"
        echo "1. MERGE THIS PR FIRST"
        echo "2. Then merge $MONOREPO_NAME paired PR"
    fi
    
    echo ""
    echo "## Testing"
    echo "- [ ] Tests pass"
    echo "- [ ] Integration verified"
    echo ""
    echo "========================================"
}

open_prs() {
    local created_prs=()
    
    log_info "Opening PRs on GitHub..."
    
    # Open PRs for source repos first
    for repo in "${TARGET_REPOS[@]}"; do
        local repo_path="$REPOS_ROOT/$repo"
        cd "$repo_path"
        
        # Check if PR already exists
        local existing_pr=$(gh pr list --head "$BRANCH_NAME" --json number --jq '.[0].number' 2>/dev/null || echo "")
        
        if [[ -n "$existing_pr" ]]; then
            log_warn "PR already exists for $repo: #$existing_pr"
            created_prs+=("$repo:#$existing_pr")
        else
            log_info "Creating PR for $repo..."
            local default_branch=$(get_default_branch "$repo_path")
            local pr_url=$(gh pr create \
                --title "feat: [DESCRIPTION] - $BRANCH_NAME" \
                --body "Paired branch: \`$BRANCH_NAME\`

Part of Zouroboros ecosystem update.

## Merge Order
1. MERGE THIS PR FIRST
2. Then merge $MONOREPO_NAME paired PR

## Related
- Blocks: [Zouroboros PR to be created]" \
                --base "$default_branch" \
                --head "$BRANCH_NAME" 2>&1)
            
            if [[ $? -eq 0 ]]; then
                log_success "Created PR for $repo: $pr_url"
                created_prs+=("$repo:$pr_url")
            else
                log_error "Failed to create PR for $repo: $pr_url"
            fi
        fi
    done
    
    # Open PR for monorepo last
    cd "$MONOREPO_PATH"
    local default_branch=$(get_default_branch "$MONOREPO_PATH")
    
    log_info "Creating PR for $MONOREPO_NAME..."
    
    # Build depends-on list
    local depends_on=""
    for entry in "${created_prs[@]}"; do
        local repo_name=$(echo "$entry" | cut -d: -f1)
        local pr_ref=$(echo "$entry" | cut -d: -f2)
        depends_on="${depends_on}- $repo_name: $pr_ref
"
    done
    
    local pr_url=$(gh pr create \
        --title "feat: [DESCRIPTION] - $BRANCH_NAME" \
        --body "Paired branch: \`$BRANCH_NAME\`

Part of Zouroboros ecosystem update.

## Depends On
$depends_on

## Merge Order
⚠️  MERGE THIS LAST after all dependent PRs are merged ⚠️

## Changes
- [ ] Update package references
- [ ] Sync with upstream changes" \
        --base "$default_branch" \
        --head "$BRANCH_NAME" 2>&1)
    
    if [[ $? -eq 0 ]]; then
        log_success "Created PR for $MONOREPO_NAME: $pr_url"
    else
        log_error "Failed to create PR for $MONOREPO_NAME: $pr_url"
    fi
}

show_status() {
    echo ""
    echo "========================================"
    echo "  WORKFLOW STATUS: $BRANCH_NAME"
    echo "========================================"
    echo ""
    
    for repo in "${TARGET_REPOS[@]}"; do
        local repo_path="$REPOS_ROOT/$repo"
        cd "$repo_path"
        local current_branch=$(git branch --show-current)
        local pr_status=$(gh pr list --head "$BRANCH_NAME" --json state,number --jq '.[0] | "#\(.number) (\(.state))"' 2>/dev/null || echo "No PR")
        
        printf "%-30s %-20s %s\n" "$repo:" "[$current_branch]" "$pr_status"
    done
    
    cd "$MONOREPO_PATH"
    local current_branch=$(git branch --show-current)
    local pr_status=$(gh pr list --head "$BRANCH_NAME" --json state,number --jq '.[0] | "#\(.number) (\(.state))"' 2>/dev/null || echo "No PR")
    
    printf "%-30s %-20s %s\n" "$MONOREPO_NAME:" "[$current_branch]" "$pr_status"
    
    echo ""
    echo "========================================"
}

# Main

if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    echo "Paired Branch Workflow for Zouroboros Multi-Repo Development"
    echo ""
    echo "Usage:"
    echo "  $0 <feature-name>              # Create branches for all repos"
    echo "  $0 <feature-name> repo1,repo2  # Create branches for specific repos"
    echo "  $0 --list-repos                # List all configured repos"
    echo "  $0 --status <branch-name>      # Show status of existing workflow"
    echo ""
    echo "Examples:"
    echo "  $0 swarm-cascade-fix"
    echo "  $0 memory-hyde zo-memory-system"
    echo "  $0 --status feat/swarm-cascade-fix"
    echo ""
    echo "Environment Variables:"
    echo "  ZOUROBOROS_MONOREPO  # Path to monorepo (default: ~/workspace/Zouroboros)"
    echo "  ZOUROBOROS_REPOS     # Path to repos root (default: ~/workspace)"
    exit 0
fi

if [[ "$1" == "--list-repos" ]]; then
    list_repos
    exit 0
fi

if [[ "$1" == "--status" ]]; then
    if [[ -z "${2:-}" ]]; then
        log_error "Branch name required for status check"
        exit 1
    fi
    BRANCH_NAME="$2"
    
    # Determine which repos to check
    if [[ -n "${3:-}" ]]; then
        IFS=',' read -ra TARGET_REPOS <<< "$3"
    else
        TARGET_REPOS=("${ALL_REPOS[@]}")
    fi
    
    show_status
    exit 0
fi

BRANCH_NAME="$1"

# Validate branch name
if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid branch name: $BRANCH_NAME"
    log_error "Use only alphanumeric characters, hyphens, underscores, and dots"
    exit 1
fi

# Add feat/ prefix if not present
if [[ ! "$BRANCH_NAME" =~ ^(feat|fix|refactor|docs)/ ]]; then
    BRANCH_NAME="feat/$BRANCH_NAME"
    log_info "Added 'feat/' prefix: $BRANCH_NAME"
fi

# Determine target repos
if [[ -n "${2:-}" ]]; then
    IFS=',' read -ra TARGET_REPOS <<< "$2"
else
    TARGET_REPOS=("${ALL_REPOS[@]}")
fi

log_info "Target repos: ${TARGET_REPOS[*]}"
log_info "Monorepo: $MONOREPO_NAME"
log_info "Branch: $BRANCH_NAME"

# Validate environment
validate_environment

# Print dependency order
print_dependency_order

# Create branches in all repos
log_info "Creating branches..."

for repo in "${TARGET_REPOS[@]}"; do
    create_branch "$REPOS_ROOT/$repo" "$BRANCH_NAME"
done

create_branch "$MONOREPO_PATH" "$BRANCH_NAME"

log_success "All branches created!"

# Print PR templates
echo ""
log_info "PR Templates:"

for repo in "${TARGET_REPOS[@]}"; do
    print_pr_template "$repo" "false"
done

print_pr_template "$MONOREPO_NAME" "true"

# Ask about opening PRs
if command -v gh &> /dev/null; then
    echo ""
    read -p "Open PRs on GitHub now? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open_prs
    else
        log_info "Skipped opening PRs. Run 'gh pr create' manually when ready."
    fi
fi

log_success "Paired branch workflow initialized!"
log_info "Next steps:"
echo "  1. Make changes in each repo"
echo "  2. Push branches: git push -u origin $BRANCH_NAME"
echo "  3. Open PRs (or run this script again with --open-prs)"
echo "  4. Merge source repos FIRST, then monorepo LAST"
