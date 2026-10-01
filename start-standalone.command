#!/bin/bash
# macOS standalone launcher; all Python/runtime setup stays in the backend.
set -euo pipefail
umask 077
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
music_root="${MUSIC_BACKEND_PATH:-$(dirname "$repo_root")/music-embedding-analysis}"
web_root="$repo_root/app"
no_browser=false
basic=false
for option in "$@"; do
    case "$option" in
        --no-browser) no_browser=true ;;
        --basic) basic=true ;;
        --help|-h) printf 'Usage: bash start-standalone.command [--basic] [--no-browser]\nSet MUSIC_BACKEND_PATH for a non-sibling backend folder.\n'; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$option" >&2; exit 2 ;;
    esac
done
[ "$(uname -s)" = Darwin ] || { printf 'Use start-standalone.cmd on Windows.\n' >&2; exit 1; }
command -v node >/dev/null || { printf 'Install Node.js for the frontend, then run this script again.\n' >&2; exit 1; }
[ -f "$music_root/start.command" ] || { printf 'Backend start.command not found: %s\n' "$music_root" >&2; exit 1; }

dotenv_value() {
    local file="$1" key="$2" line value
    [ -f "$file" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z_0-9]*)[[:space:]]*=(.*)$ ]] && [ "${BASH_REMATCH[2]}" = "$key" ]; then
            value="${BASH_REMATCH[3]}"
            value="${value#"${value%%[![:space:]]*}"}"
            value="${value%"${value##*[![:space:]]}"}"
            if [[ "$value" = \"*\" || "$value" = \'*\' ]]; then value="${value:1:${#value}-2}";
            else value="${value%%[[:space:]]\#*}"; fi
            printf '%s' "$value"
            return 0
        fi
    done < "$file"
}

[ -f "$web_root/.env" ] || cp "$web_root/.env.example" "$web_root/.env"
if [ ! -f "$web_root/node_modules/vite/bin/vite.js" ]; then
    npm ci --prefix "$web_root"
fi
if [ -z "${MAB_SESSION_TOKEN:-}" ] && [ -z "$(dotenv_value "$music_root/.env" MAB_SESSION_TOKEN)" ]; then
    export MAB_SESSION_TOKEN="$(dotenv_value "$web_root/.env" VITE_MUSIC_ANALYSIS_TOKEN)"
fi
prepare_arguments=(--prepare-only)
if $basic; then prepare_arguments+=(--basic); export MAB_AUTO_LOAD_PROVIDER=''; fi
printf 'Preparing backend and verifying Essentia modules...\n'
bash "$music_root/start.command" "${prepare_arguments[@]}"

music_port="${MAB_PORT:-$(dotenv_value "$music_root/.env" MAB_PORT)}"
music_port="${music_port:-49321}"
[[ "$music_port" =~ ^[0-9]+$ ]] && [ "$music_port" -ge 1 ] && [ "$music_port" -le 65535 ] || { printf 'Invalid MAB_PORT.\n' >&2; exit 1; }
log_root="$repo_root/.standalone-logs"
mkdir -p "$log_root"
run_id="$(date '+%Y%m%d-%H%M%S')-$$"
backend_pid=''
front_pid=''
cleanup() {
    for process in "$front_pid" "$backend_pid"; do
        [ -n "$process" ] || continue
        pkill -TERM -P "$process" 2>/dev/null || true
        kill "$process" 2>/dev/null || true
        wait "$process" 2>/dev/null || true
    done
    printf '\nServices stopped. Logs: %s (%s)\n' "$log_root" "$run_id"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
(cd "$music_root"; exec .venv/bin/python -m music_annotation_backend.main) >"$log_root/$run_id-backend.out.log" 2>"$log_root/$run_id-backend.err.log" &
backend_pid=$!
(cd "$web_root"; exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort) >"$log_root/$run_id-web.out.log" 2>"$log_root/$run_id-web.err.log" &
front_pid=$!
opened=false
ready=false
printf 'Waiting for web app and backend. Press Q or Ctrl+C to stop.\n'
while true; do
    kill -0 "$backend_pid" 2>/dev/null || { printf 'Backend exited. See %s\n' "$log_root/$run_id-backend.err.log" >&2; exit 1; }
    kill -0 "$front_pid" 2>/dev/null || { printf 'Frontend exited. See %s\n' "$log_root/$run_id-web.err.log" >&2; exit 1; }
    if ! $opened && curl -fsS --max-time 2 http://127.0.0.1:5173/ >/dev/null 2>&1; then
        opened=true
        printf 'Browser app: http://127.0.0.1:5173/\n'
        $no_browser || open http://127.0.0.1:5173/
    fi
    if ! $ready && curl -fsS --max-time 2 "http://127.0.0.1:$music_port/v1/health" >/dev/null 2>&1; then
        ready=true
        printf 'Music analysis API ready; Essentia modules verified.\n'
    fi
    if [ -t 0 ]; then
        key=''
        read -r -t 1 -n 1 key || true
        [ "$key" != q ] && [ "$key" != Q ] || break
    else sleep 1; fi
done
