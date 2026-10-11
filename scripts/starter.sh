#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-start}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_path="$root_dir/build/router"
log_dir="${ROUTER_LOG_DIR:-$root_dir/logs}"
pid_dir="$root_dir/run"
pid_file="$pid_dir/router.pid"
port="${ROUTER_PORT:-3011}"
stop_timeout_seconds="${STOP_TIMEOUT_SECONDS:-30}"
force_stop_timeout_seconds="${FORCE_STOP_TIMEOUT_SECONDS:-5}"

ensure_dirs() {
  mkdir -p "$log_dir" "$pid_dir"
  touch "$log_dir/error.log"
}

is_running() {
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      local state
      state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d '[:space:]')"
      [[ -n "$state" && "${state:0:1}" != "Z" ]] && return 0
    fi
  fi
  return 1
}

validate_stop_timeouts() {
  [[ "$stop_timeout_seconds" =~ ^[0-9]+$ ]] || { echo "STOP_TIMEOUT_SECONDS must be a non-negative integer." >&2; exit 1; }
  [[ "$force_stop_timeout_seconds" =~ ^[0-9]+$ ]] || { echo "FORCE_STOP_TIMEOUT_SECONDS must be a non-negative integer." >&2; exit 1; }
}

start() {
  ensure_dirs
  if [[ ! -x "$bin_path" ]]; then
    echo "Binary not found or not executable: $bin_path" >&2
    echo "Build first: mkdir -p build && go build -o build/router ./cmd/router" >&2
    exit 1
  fi

  if is_running; then
    echo "Router already running (pid $(cat "$pid_file"))."
    return 0
  fi

  cd "$root_dir"
  nohup "$bin_path" --port "$port" --log-dir "$log_dir" \
    >>"$log_dir/starter.log" 2>&1 &
  echo $! > "$pid_file"
  echo "Router started (pid $(cat "$pid_file")), port $port."
}

stop() {
  validate_stop_timeouts
  if [[ ! -f "$pid_file" ]]; then
    echo "Router not running (pid file missing)."
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    echo "Router not running."
    return 0
  fi

  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  local stop_wait_limit=$((stop_timeout_seconds * 5))
  while is_running; do
    if (( waited >= stop_wait_limit )); then
      break
    fi
    sleep 0.2
    waited=$((waited + 1))
  done

  if is_running; then
    echo "Graceful stop timed out after ${stop_timeout_seconds}s; sending SIGKILL." >&2
    kill -KILL "$pid" 2>/dev/null || true
    waited=0
    while is_running; do
      if (( waited >= force_stop_timeout_seconds * 5 )); then
        echo "Router process $pid did not exit after SIGKILL; refusing to start." >&2
        return 1
      fi
      sleep 0.2
      waited=$((waited + 1))
    done
  fi

  rm -f "$pid_file"
  echo "Router stopped."
}

restart() {
  if ! stop; then
    return 1
  fi
  start
}

case "$cmd" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  *)
    echo "Usage: $(basename "$0") {start|stop|restart}" >&2
    exit 1
    ;;
esac
