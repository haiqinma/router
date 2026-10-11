#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 3 ]]; then
  printf 'Usage: %s <prepare|copy-config|post-copy|finalize> <current-dir> <target-dir>\n' "$0" >&2
  exit 1
fi

case "$1" in
  prepare|post-copy|finalize) exit 0 ;;
  copy-config)
    [[ -f "$2/config.yaml" ]] || { printf 'Config file not found: %s/config.yaml\n' "$2" >&2; exit 1; }
    [[ -d "$3" ]] || { printf 'Target directory not found: %s\n' "$3" >&2; exit 1; }
    cp -f "$2/config.yaml" "$3/config.yaml"
    ;;
  *)
    printf 'Unsupported upgrade phase: %s\n' "$1" >&2
    exit 1
    ;;
esac
