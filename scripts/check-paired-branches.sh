#!/bin/bash
#
# Check for unpaired branch changes across Zouroboros ecosystem repos
# 
# This script detects when you have:
# 1. Uncommitted changes in individual repos
# 2. Committed changes on branches in individual repos without matching monorepo branches
# 3. Active feature branches that need paired PRs
#
# Usage: ./check-paired-branches.sh [--notify]
#

set -euo pipefail

# Configuration
MONOREPO_NAME="Zouroboros"
MONOREPO_PATH="${ZOUROBOROS_MONOREPO:-/home/workspace/Zouroboros}"
REPOS_ROOT="${ZOUROBOROS_REPOS:-/home/workspace}"

# All ecosystem repos
ALL_REPOS=(
    "zo-swarm-orchestrator"
    "zo-memory-system"
    "zo-executors"
    "zo-persona-creator"
    "zo-vault"
    "zo-code-server-setup"
    "omniroute-tier-resolver"
)

# Output formatting
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

ISSUES_FOUND=0
ISSUES_DETAILS=""

log_section() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
}

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check for uncommitted changes
check_uncommitted() {
    local repo_path="$1"
    local repo_name=$(basename "$repo_path")
    
    cd "$repo_path"
    
    if [[ -n $(git status --short) ]]; then
        log_error "$repo_name has uncommitted changes"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_DETAILS="${ISSUES_DETAILS}
- **$repo_name**: Uncommitted changes detected
\`\`\`
$(git status --short | head -20)
\`\`\`
"
        return 1
    fi
    return 0
}

# Check for branches that exist in individual repos but not monorepo
check_unpaired_branches() {
    local repo_path="$1"
    local repo_name=$(basename "$repo_path")
    
    cd "$repo_path"
    
    # Get local branches (excluding main/master)
    local branches=$(git branch --format='%(refname:short)' | grep -v '^main$' | grep -v '^master$' || true)
    
    if [[ -z "$branches" ]]; then
        return 0
    fi
    
    cd "$MONOREPO_PATH"
    local monorepo_branches=$(git branch --format='%(refname:short)' 2>/dev/null || true)
    
    local unpaired=""
    while IFS= read -r branch; do
        if [[ -n "$branch" ]] && [[ ! "$monorepo_branches" =~ "$branch" ]]; then
            unpaired="${unpaired}- $branch\n"
        fi
    done <<< "$branches"
    
    if [[ -n "$unpaired" ]]; then
        log_warn "$repo_name has unpaired branches:"
        echo -e "$unpaired"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_DETAILS="${ISSUES_DETAILS}
- **$repo_name**: Unpaired branches found
  - Missing from monorepo:
$(echo -e "$unpaired" | sed 's/^/    /')
  
  **Fix**: Run \`./scripts/paired-branch.sh\` for these branches
"
    fi
}

# Check for branches with commits ahead of main
check_ahead_branches() {
    local repo_path="$1"
    local repo_name=$(basename "$repo_path")
    
    cd "$repo_path"
    
    local default_branch="main"
    git show-ref --verify --quiet refs/heads/main || default_branch="master"
    
    local ahead_branches=$(git branch --format='%(refname:short)' | while read -r branch; do
        if [[ "$branch" != "$default_branch" ]]; then
            local ahead=$(git rev-list --count "$default_branch..$branch" 2>/dev/null || echo "0")
            if [[ "$ahead" -gt 0 ]]; then
                echo "- $branch ($ahead commits ahead of $default_branch)"
            fi
        fi
    done)
    
    if [[ -n "$ahead_branches" ]]; then
        log_info "$repo_name has branches with unpushed work:"
        echo "$ahead_branches"
        
        cd "$MONOREPO_PATH"
        local default_branch="main"
        git show-ref --verify --quiet refs/heads/main || default_branch="master"
        
        local missing_in_mono=""
        while IFS= read -r line; do
            local branch=$(echo "$line" | grep -oP '^- \K[^ ]+' || true)
            if [[ -n "$branch" ]] && ! git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
                missing_in_mono="${missing_in_mono}$line (NOT in monorepo)\n"
            fi
        done <<< "$ahead_branches"
        
        if [[ -n "$missing_in_mono" ]]; then
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
            ISSUES_DETAILS="${ISSUES_DETAILS}
- **$repo_name**: Work on branches not synced to monorepo
$(echo -e "$missing_in_mono" | sed 's/^/  /')
  
  **Fix**: Push branches and run \`./scripts/paired-branch.sh $branch\`
"
        fi
    fi
}

# Check for open PRs in individual repos without matching monorepo PRs
check_open_prs() {
    if ! command -v gh &> /dev/null; then
        log_info "GitHub CLI not available, skipping PR check"
        return 0
    fi
    
    log_info "Checking for open PRs..."
    
    local repos_with_prs=""
    for repo in "${ALL_REPOS[@]}"; do
        local repo_path="$REPOS_ROOT/$repo"
        if [[ ! -d "$repo_path/.git" ]]; then
            continue
        fi
        
        cd "$repo_path"
        
        # Get open PRs for this repo
        local prs=$(gh pr list --state open --json number,headRefName,title --jq '.[] | "- #\(.number): \(.title) (branch: \(.headRefName))"' 2>/dev/null || true)
        
        if [[ -n "$prs" ]]; then
            repos_with_prs="${repos_with_prs}**$repo**:\n$prs\n\n"
        fi
    done
    
    if [[ -n "$repos_with_prs" ]]; then
        log_warn "Open PRs found in individual repos:"
        echo -e "$repos_with_prs"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_DETAILS="${ISSUES_DETAILS}
- **Open PRs in individual repos** that may need monorepo pairing:
$(echo -e "$repos_with_prs" | sed 's/^/  /')
"
    fi
}

# Main check
main() {
    local notify=false
    if [[ "${1:-}" == "--notify" ]]; then
        notify=true
    fi
    
    log_section "Zouroboros Paired Branch Check"
    
    log_info "Checking repos: ${ALL_REPOS[*]}"
    log_info "Monorepo: $MONOREPO_PATH"
    
    # Check each repo
    for repo in "${ALL_REPOS[@]}"; do
        local repo_path="$REPOS_ROOT/$repo"
        
        if [[ ! -d "$repo_path/.git" ]]; then
            log_info "Skipping $repo (not found)"
            continue
        fi
        
        check_uncommitted "$repo_path" || true
        check_unpaired_branches "$repo_path" || true
        check_ahead_branches "$repo_path" || true
    done
    
    # Check for open PRs
    check_open_prs || true
    
    # Summary
    log_section "Summary"
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        log_success "All repos are clean and properly paired!"
        exit 0
    else
        log_warn "Found $ISSUES_FOUND issue(s) that need attention"
        
        if [[ "$notify" == true ]]; then
            # Output in a format suitable for email/notification
            echo ""
            echo "ISSUES_FOUND=$ISSUES_FOUND"
            echo "---DETAILS---"
            echo -e "$ISSUES_DETAILS"
        fi
        
        exit 1
    fi
}

main "$@"
