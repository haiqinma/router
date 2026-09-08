#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config.yaml"

log() {
  printf '[copy-for-upgrade] %s\n' "$*"
}

die() {
  printf '[copy-for-upgrade] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: scripts/copy-for-upgrade.sh <target-dir-full-path>

Copies config.yaml from the project root to the target version directory,
replacing the target config.yaml without creating a backup.
USAGE
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

target_dir="$1"

if [[ "$target_dir" != /* ]]; then
  die "target directory must be an absolute path: $target_dir"
fi

if [[ ! -d "$target_dir" ]]; then
  die "target directory not found: $target_dir"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  die "config file not found: $CONFIG_FILE"
fi

log "Copying config.yaml to $target_dir"
cp -f "$CONFIG_FILE" "$target_dir/config.yaml"

log "config.yaml copied successfully"
exit 0
