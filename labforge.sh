#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  LabForge CLI — Pentest Teaching Platform
#  Calls backend API when running, falls back to docker compose directly
#
#  USAGE:
#    ./labforge.sh start              Start LabForge UI → http://localhost:3000
#    ./labforge.sh start lab01        Deploy lab01 for students
#    ./labforge.sh start beginner     Deploy all 20 beginner labs
#    ./labforge.sh start chain        Deploy all 6 chain labs
#    ./labforge.sh start all          Deploy everything
#    ./labforge.sh stop lab01         Stop lab01
#    ./labforge.sh stop all           Stop all labs
#    ./labforge.sh status             Show all lab states
#    ./labforge.sh monitor lab01      Live log stream for lab01
#    ./labforge.sh logs lab01         Last 50 log lines for lab01
#    ./labforge.sh chat "question"    Ask AI Advisor
#    ./labforge.sh build              Pre-build all images
#    ./labforge.sh clean              Remove all containers + volumes
#    ./labforge.sh open               Open UI in browser
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

log()  { echo -e "${GREEN}[✔]${RESET} $*"; }
info() { echo -e "${CYAN}[i]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
err()  { echo -e "${RED}[✘]${RESET} $*" >&2; exit 1; }
hdr()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${RESET}\n${BOLD}  $*${RESET}\n${BOLD}${CYAN}══════════════════════════════════════${RESET}"; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DC="docker compose -f ${DIR}/docker-compose.yml"
API="${LABFORGE_API:-http://localhost:3000}"

# ── Check if platform API is running ────────────────────────────────
api_up() { curl -sf --max-time 3 "${API}/api/health" >/dev/null 2>&1; }

# ── API request helper ───────────────────────────────────────────────
api() {
  local method=$1 path=$2; shift 2
  curl -sf --max-time 90 -X "$method" -H "Content-Type: application/json" "${API}${path}" "$@" 2>/dev/null
}

# ── Normalise lab id: "lab01" or "01" → "01"; "c01" or "C01" → "C01"
normalise() {
  local raw="${1,,}"  # lowercase
  raw="${raw#lab}"    # strip leading "lab"
  if [[ "$raw" =~ ^c[0-9]+$ ]]; then
    echo "${raw^^}"   # chain labs → uppercase C01
  else
    printf '%02d' "$((10#${raw}))" 2>/dev/null || echo "$raw"
  fi
}

# ── Start/stop a single lab via API or compose fallback ─────────────
start_lab() {
  local id; id=$(normalise "$1")
  if api_up; then
    local r; r=$(api POST "/api/labs/${id}/start" 2>/dev/null || true)
    echo "$r" | grep -q '"success":true' && log "Started lab ${id}" || warn "Start returned: ${r:0:120}"
  else
    # direct compose
    local profile="lab${id,,}"
    [[ "$id" =~ ^C ]] && profile="c${id:1}"
    $DC --profile "$profile" up -d --build 2>&1 | grep -E '(Started|Created|Building|error)' || true
    log "Started lab ${id}"
  fi
}

stop_lab() {
  local id; id=$(normalise "$1")
  if api_up; then
    api POST "/api/labs/${id}/stop" >/dev/null 2>&1 || true
    log "Stopped lab ${id}"
  else
    local profile="lab${id,,}"
    [[ "$id" =~ ^C ]] && profile="c${id:1}"
    $DC --profile "$profile" down 2>&1 | grep -E '(Stopped|Removed|error)' || true
    log "Stopped lab ${id}"
  fi
}

# ══════════════════════════════════════════════════════════════════════
CMD="${1:-help}"
TARGET="${2:-}"

case "$CMD" in

  start)
    hdr "LabForge — Start"
    docker info >/dev/null 2>&1 || err "Docker is not running."

    # Always ensure platform UI is up first
    if ! api_up; then
      info "Starting LabForge platform UI…"
      $DC up -d labforge
      for i in $(seq 1 15); do sleep 1; api_up && break; done
    fi
    api_up && log "Platform UI ready → ${CYAN}${API}${RESET}" || warn "API not responding yet — give it a few seconds"

    case "$TARGET" in
      ""|ui) : ;;
      all)
        info "Deploying all 27 labs…"
        $DC --profile all up -d --build 2>&1 | grep -cE '(Started|Created)' | xargs -I{} echo "{} containers started" || true
        ;;
      beginner)
        info "Deploying beginner labs 01–20…"
        $DC --profile beginner up -d --build 2>&1 | tail -3
        ;;
      chain)
        info "Deploying chain labs C01–C06…"
        $DC --profile chain up -d --build 2>&1 | tail -3
        ;;
      hardened)
        info "Deploying hardened reference lab…"
        $DC --profile hardened up -d --build 2>&1 | tail -3
        ;;
      lab*|[0-9]*|c[0-9]*|C[0-9]*)
        start_lab "$TARGET"
        ;;
      *)
        warn "Unknown target: $TARGET"
        ;;
    esac

    echo ""
    "$0" status 2>/dev/null | head -40 || true
    ;;

  stop)
    hdr "LabForge — Stop"
    case "$TARGET" in
      ""|ui)
        $DC stop labforge && $DC rm -f labforge
        log "Platform UI stopped"
        ;;
      all)
        $DC --profile all down -v --remove-orphans 2>&1 | tail -3
        log "All containers stopped and volumes removed"
        ;;
      beginner) $DC --profile beginner down -v 2>&1|tail -3; log "Beginner labs stopped" ;;
      chain)    $DC --profile chain down -v 2>&1|tail -3; log "Chain labs stopped" ;;
      lab*|[0-9]*|c[0-9]*|C[0-9]*) stop_lab "$TARGET" ;;
      *) warn "Unknown target: $TARGET" ;;
    esac
    ;;

   status)
     hdr "LabForge — Status"
     if api_up; then
       statuses=$(api GET "/api/labs/status" 2>/dev/null || echo '{}')
       echo ""
       echo -e "  ${BOLD}Beginner Labs (01–20)${RESET}"
       for i in $(seq -w 01 20); do
         s=$(echo "$statuses" | grep -o "\"${i}\":\"[^\"]*\"" | cut -d'"' -f4 || echo "unknown")
         case "$s" in
           running)  echo -e "    ${GREEN}●${RESET} Lab ${i} — ${GREEN}RUNNING${RESET}" ;;
           stopped)  echo -e "    ${DIM}○${RESET} Lab ${i} — stopped" ;;
           starting) echo -e "    ${YELLOW}●${RESET} Lab ${i} — ${YELLOW}STARTING…${RESET}" ;;
           *)        echo -e "    ${DIM}?${RESET} Lab ${i} — ${s}" ;;
         esac
       done
       echo ""
       echo -e "  ${BOLD}Chain Labs (C01–C06)${RESET}"
       for i in C01 C02 C03 C04 C05 C06; do
         s=$(echo "$statuses" | grep -o "\"${i}\":\"[^\"]*\"" | cut -d'"' -f4 || echo "unknown")
         case "$s" in
           running)  echo -e "    ${GREEN}●${RESET} ${i} — ${GREEN}RUNNING${RESET}" ;;
           stopped)  echo -e "    ${DIM}○${RESET} ${i} — stopped" ;;
           *)        echo -e "    ${DIM}?${RESET} ${i} — ${s}" ;;
         esac
       done
       running=$(echo "$statuses" | grep -o '"running"' | wc -l | tr -d ' ')
       echo ""
       log "${running} lab(s) running"
     else
       warn "Platform API not reachable — using docker ps"
       docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(lab|labforge|NAME)" || echo "  No containers"
     fi
     ;;

  monitor)
    [[ -z "$TARGET" ]] && err "Usage: ./labforge.sh monitor <lab-id>  e.g. lab01 or C01"
    local id; id=$(normalise "$TARGET")
    hdr "LabForge — Live Monitor: Lab ${id}"
    if ! api_up; then err "Platform API not running. Start it: ./labforge.sh start"; fi
    info "Streaming logs from lab ${id} — Ctrl+C to stop"
    echo ""
    curl -sN --max-time 0 "${API}/api/labs/${id}/stream" | while IFS= read -r line; do
      # Strip SSE prefixes
      data="${line#data: }"
      event="${line#event: }"
      [[ "$line" == data:* ]] || continue
      # Colour attack patterns
      if echo "$data" | grep -qiE "(UNION SELECT|OR 1=1|etc/passwd|169\.254|<script|FLUSHALL|\\\$where)"; then
        echo -e "${RED}⚠${RESET} ${data}"
      elif echo "$data" | grep -qE "\b[45][0-9]{2}\b"; then
        echo -e "${YELLOW}${data}${RESET}"
      elif echo "$data" | grep -qE "\b2[0-9]{2}\b"; then
        echo -e "${DIM}${data}${RESET}"
      else
        echo "$data"
      fi
    done
    ;;

   logs)
     [[ -z "$TARGET" ]] && err "Usage: ./labforge.sh logs <lab-id>"
     id=$(normalise "$TARGET")
     lines="${3:-80}"
     if api_up; then
       api GET "/api/labs/${id}/logs?lines=${lines}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('logs','No logs'))" 2>/dev/null || \
       api GET "/api/labs/${id}/logs?lines=${lines}"
     else
       docker logs --tail="${lines}" "lab${id}" 2>/dev/null || docker logs --tail="${lines}" "c0${id:1}" 2>/dev/null || err "Container not found"
     fi
     ;;

  chat)
    local question="${TARGET:-}"
    [[ $# -ge 2 ]] && question="$2"
    [[ -z "$question" ]] && err "Usage: ./labforge.sh chat \"your question\""
    api_up || err "Platform API not running. Start: ./labforge.sh start"
    hdr "LabForge AI Advisor"
    local model; model=$(localStorage 2>/dev/null || echo "qwen2.5:7b-instruct")
    local payload; payload=$(python3 -c "
import json,sys
print(json.dumps({'model':'qwen2.5:7b-instruct','stream':False,'messages':[
  {'role':'system','content':'You are LabForge AI — expert pentesting educator for a Docker-based lab platform. Be concise and practical.'},
  {'role':'user','content':sys.argv[1]}
]}))" "$question")
    echo ""
    curl -sf --max-time 120 -X POST -H "Content-Type: application/json" -d "$payload" "${API}/api/ollama/chat" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',{}).get('content','No response'))" 2>/dev/null || \
      echo "Could not reach Ollama. Ensure 'ollama serve' is running."
    ;;

  open)
    if command -v xdg-open &>/dev/null; then xdg-open "$API"
    elif command -v open &>/dev/null; then open "$API"
    else info "Open in browser: ${CYAN}${API}${RESET}"; fi
    ;;

  build)
    hdr "LabForge — Pre-building all images"
    docker info >/dev/null 2>&1 || err "Docker not running"
    warn "Building all 28 images. This may take 15–30 minutes on first run."
    $DC --profile all build --parallel
    log "All images built and cached"
    ;;

  clean)
    hdr "LabForge — Full Cleanup"
    warn "This removes ALL LabForge containers, networks, and volumes!"
    read -rp "  Type 'yes' to confirm: " c
    [[ "$c" == "yes" ]] || { info "Cancelled."; exit 0; }
    $DC --profile all down -v --remove-orphans 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
    log "Cleanup complete"
    ;;

  help|*)
    echo ""
    echo -e "${BOLD}${CYAN}  ⚡ LABFORGE — Pentest Teaching Platform${RESET}"
    echo -e "  Platform UI: ${CYAN}${API}${RESET}"
    echo ""
    echo -e "  ${BOLD}COMMANDS${RESET}"
    echo -e "    ${GREEN}start${RESET}                Start platform UI   → ${CYAN}http://localhost:3000${RESET}"
    echo -e "    ${GREEN}start beginner${RESET}       Deploy labs 01–20 for students"
    echo -e "    ${GREEN}start chain${RESET}          Deploy chain labs C01–C06"
    echo -e "    ${GREEN}start lab06${RESET}          Deploy one specific lab"
    echo -e "    ${GREEN}start all${RESET}            Deploy all 27 labs (~8GB RAM)"
    echo -e "    ${YELLOW}stop all${RESET}             Stop + remove all containers"
    echo -e "    ${YELLOW}stop lab06${RESET}           Stop one lab"
    echo -e "    ${CYAN}status${RESET}               Show all lab states"
    echo -e "    ${CYAN}monitor lab01${RESET}        Live log stream + attack detection"
    echo -e "    ${CYAN}logs lab01${RESET}           Last 80 log lines"
    echo -e "    ${CYAN}chat \"question\"${RESET}      Ask AI Advisor from terminal"
    echo -e "    ${CYAN}open${RESET}                 Open UI in browser"
    echo -e "    ${CYAN}build${RESET}                Pre-build all Docker images"
    echo -e "    ${RED}clean${RESET}                Remove all containers + volumes"
    echo ""
    echo -e "  ${BOLD}PORT MAP${RESET}"
    echo -e "    Platform UI:    ${CYAN}:3000${RESET}"
    echo -e "    Beginner Labs:  ${CYAN}:8001–8020${RESET}  (01–20)"
    echo -e "    Hardened Ref:   ${CYAN}:8021${RESET}       (21)"
    echo -e "    Chain Labs:     ${CYAN}:9001–9006${RESET}  (C01–C06)"
    echo ""
    echo -e "  ${BOLD}ROLES${RESET}"
    echo -e "    Teacher/Admin → uses this CLI + the UI to deploy, build, monitor"
    echo -e "    Student       → connects to the lab port to attack"
    echo ""
    echo -e "  ${DIM}LABFORGE_API env var overrides API URL (default: http://localhost:3000)${RESET}"
    echo ""
    ;;
esac
