#!/bin/bash
set -euo pipefail

# Export Zouroboros skills from monorepo packages into standard Skill format
# Usage: ./scripts/export-skills.sh [--dest <dir>] [--skill <name>]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="${ZOUROBOROS_SKILLS_DIR:-${HOME}/Skills}"
SKILL_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST="$2"; shift 2 ;;
    --skill) SKILL_FILTER="$2"; shift 2 ;;
    --help|-h)
      echo "Export Zouroboros skills to standard Skill directory format"
      echo ""
      echo "Usage: $0 [--dest <dir>] [--skill <name>]"
      echo ""
      echo "Options:"
      echo "  --dest <dir>    Target directory (default: ~/Skills)"
      echo "  --skill <name>  Export a single skill by name"
      echo ""
      echo "Skills:"
      echo "  spec-first-interview    Socratic interview & seed generator"
      echo "  three-stage-eval        Mechanical/semantic/consensus eval"
      echo "  autoloop                Single-metric optimization loop"
      echo "  unstuck-lateral         5 lateral-thinking personas"
      echo "  zouroboros-introspect   7-metric health scorecard"
      echo "  zouroboros-prescribe    Auto-generate improvement seeds"
      echo "  zouroboros-evolve       Prescription execution"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$DEST"

INSTALLED=0
SKIPPED=0

install_skill() {
  local name="$1"
  local pkg="$2"     # workflow or selfheal
  local doc_dir="$3" # subdirectory under docs/
  local standalone_scripts="$4" # comma-separated list of standalone script filenames (or empty)

  if [[ -n "$SKILL_FILTER" && "$SKILL_FILTER" != "$name" ]]; then
    return
  fi

  local src_docs="$REPO_ROOT/packages/$pkg/docs/$doc_dir"
  local dest_skill="$DEST/$name"

  if [[ ! -d "$src_docs" ]]; then
    echo "  ⚠  $name — source docs not found at $src_docs"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  echo "  → $name"
  rm -rf "$dest_skill"
  mkdir -p "$dest_skill"

  # Copy SKILL.md
  if [[ -f "$src_docs/SKILL.md" ]]; then
    cp "$src_docs/SKILL.md" "$dest_skill/SKILL.md"
  fi

  # Copy references
  if [[ -d "$src_docs/references" ]]; then
    cp -r "$src_docs/references" "$dest_skill/references"
  fi

  # Copy assets
  if [[ -d "$src_docs/assets" ]]; then
    cp -r "$src_docs/assets" "$dest_skill/assets"
  fi

  # Copy standalone scripts
  if [[ -n "$standalone_scripts" ]]; then
    mkdir -p "$dest_skill/scripts"
    IFS=',' read -ra FILES <<< "$standalone_scripts"
    for f in "${FILES[@]}"; do
      local src_file="$REPO_ROOT/packages/$pkg/src/standalone/$f"
      if [[ -f "$src_file" ]]; then
        cp "$src_file" "$dest_skill/scripts/$f"
      fi

      # Also check the autoloop standalone location
      local alt_file="$REPO_ROOT/packages/$pkg/src/autoloop/standalone/$f"
      if [[ -f "$alt_file" ]]; then
        cp "$alt_file" "$dest_skill/scripts/$f"
      fi
    done
  fi

  INSTALLED=$((INSTALLED + 1))
}

echo ""
echo "🐍 Exporting Zouroboros skills → $DEST"
echo ""

# Workflow skills
install_skill "spec-first-interview" "workflow" "spec-first-interview" ""
install_skill "three-stage-eval"     "workflow" "three-stage-eval"     ""
install_skill "unstuck-lateral"      "workflow" "unstuck-lateral"      ""
install_skill "autoloop"             "workflow" "autoloop"             "autoloop.ts,mcp-server.ts,mcp-server-http.ts"

# Selfheal skills
install_skill "zouroboros-introspect" "selfheal" "introspect" "introspect.ts,skill-tracker.ts"
install_skill "zouroboros-prescribe"  "selfheal" "prescribe"  "prescribe.ts"
install_skill "zouroboros-evolve"     "selfheal" "evolve"     "evolve.ts"

echo ""
if [[ $INSTALLED -gt 0 ]]; then
  echo "✅ Exported $INSTALLED skill(s) to $DEST"
else
  echo "⚠  No skills exported"
fi
if [[ $SKIPPED -gt 0 ]]; then
  echo "⚠  $SKIPPED skill(s) skipped (missing sources)"
fi
echo ""
echo "Usage:"
echo "  bun $DEST/zouroboros-introspect/scripts/introspect.ts --help"
echo "  bun $DEST/autoloop/scripts/autoloop.ts --help"
