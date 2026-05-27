#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HANDBOOK_PAIRS=(
  "docs/guide/player-handbook.md:frontend/public/handbooks/player-handbook.md"
  "docs/guide/trainer-handbook.md:frontend/public/handbooks/trainer-handbook.md"
  "docs/guide/designer-handbook.md:frontend/public/handbooks/designer-handbook.md"
  "docs/guide/admin-handbook.md:frontend/public/handbooks/admin-handbook.md"
)

usage() {
  cat <<'EOF'
Usage:
  bash ./sync-handbooks.sh         Copy docs/guide handbook sources to frontend/public/handbooks
  bash ./sync-handbooks.sh --check Verify that mirrored handbook files are in sync

Notes:
  - This script only syncs the mirrored role handbooks.
  - The public calculation-engine guide currently has no docs/guide mirror.
EOF
}

check_pair() {
  local src="$1"
  local dst="$2"

  if ! cmp -s "$ROOT_DIR/$src" "$ROOT_DIR/$dst"; then
    echo "Out of sync: $src -> $dst"
    return 1
  fi
}

sync_pair() {
  local src="$1"
  local dst="$2"

  cp "$ROOT_DIR/$src" "$ROOT_DIR/$dst"
  echo "Synced $src -> $dst"
}

main() {
  local mode="${1:-}"
  local failed=0

  case "$mode" in
    "")
      for pair in "${HANDBOOK_PAIRS[@]}"; do
        IFS=":" read -r src dst <<< "$pair"
        sync_pair "$src" "$dst"
      done
      ;;
    --check)
      for pair in "${HANDBOOK_PAIRS[@]}"; do
        IFS=":" read -r src dst <<< "$pair"
        if ! check_pair "$src" "$dst"; then
          failed=1
        fi
      done

      if [[ "$failed" -ne 0 ]]; then
        echo "Run 'bash ./sync-handbooks.sh' to refresh the mirrored public handbook files."
        exit 1
      fi

      echo "All mirrored handbook files are in sync."
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"