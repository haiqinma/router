#!/usr/bin/env bash
set -euo pipefail

suite=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite) [[ $# -ge 2 ]] || { echo '--suite requires a value' >&2; exit 2; }; suite=$2; shift 2 ;;
    --help|-h) printf 'Usage: %s --suite smoke\n' "$(basename "$0")"; exit 0 ;;
    *) echo "Unsupported argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$suite" == smoke ]] || { echo 'Only --suite smoke is supported.' >&2; exit 2; }
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/health-check.sh" --level readiness
