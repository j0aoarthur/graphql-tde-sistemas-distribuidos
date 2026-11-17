#!/usr/bin/env bash
# Prepara o ambiente LOCAL para a Arena de concorrência (demonstração acadêmica; nunca usar em produção).
# Reinicia viaturas-service, gateway e N réplicas do dispatch-worker (mesmo consumer group) com
# SDV_DEMO_TRACE=1 e SDV_DEMO_MODE=1. Postgres, Redis, OSRM, ocorrencias-service e gps-simulator devem estar no ar.
#
# Uso:
#   scripts/demo-arena.sh up      [workers=3]   (requer `npm run build` feito)
#   scripts/demo-arena.sh down                   (para os processos da arena e restaura as viaturas reservadas)
#   scripts/demo-arena.sh status
# Variáveis: GATEWAY_PORT (4000), VIATURAS_PORT (4002), ARENA_WORKERS (3).
set -euo pipefail
cd "$(dirname "$0")/.."
RUN=.demo-arena; mkdir -p "$RUN"; PIDS="$RUN/pids"
GATEWAY_PORT="${GATEWAY_PORT:-4000}"; VIATURAS_PORT="${VIATURAS_PORT:-4002}"
load_env(){ set -a; [[ -f .env ]] && source .env; set +a; }
stop_ours(){
  [[ -f "$PIDS" ]] || return 0
  while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"; rm -f "$PIDS"; sleep 2
}
port_free_or_ours(){ # $1 porta; aborta se outro processo (não nosso) a ocupa
  local pid; pid=$(lsof -nti "tcp:$1" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  [[ -z "$pid" ]] && return 0
  if [[ -f "$PIDS" ]] && grep -qx "$pid" "$PIDS"; then return 0; fi
  echo "Porta $1 ocupada pelo PID $pid (outro processo). Escolha outra com GATEWAY_PORT/VIATURAS_PORT ou encerre-o." >&2; exit 1
}
start(){ # nome, comando...  (stdout/stderr em .demo-arena/<nome>.log)
  local name="$1"; shift; nohup "$@" > "$RUN/$name.log" 2>&1 & echo $! >> "$PIDS"
}
case "${1:-status}" in
  up)
    load_env; WORKERS="${2:-${ARENA_WORKERS:-3}}"
    [[ "$WORKERS" =~ ^[1-9]$ ]] || { echo "workers deve ser 1..9" >&2; exit 1; }
    for f in apps/viaturas-service/dist/main.js apps/gateway/dist/main.js apps/dispatch-worker/dist/main.js; do
      [[ -f "$f" ]] || { echo "Falta $f — rode: npm run build" >&2; exit 1; }
    done
    # Para processos antigos do SDV nessas portas/papéis (somente se forem node do SDV).
    for port in "$GATEWAY_PORT" "$VIATURAS_PORT"; do
      pid=$(lsof -nti "tcp:$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)
      if [[ -n "$pid" ]] && ps -p "$pid" -o command= | grep -Eq "apps/(gateway|viaturas-service)/dist/main.js"; then kill "$pid"; fi
    done
    pkill -f "apps/dispatch-worker/dist/main.js" 2>/dev/null || true
    stop_ours; sleep 2; port_free_or_ours "$GATEWAY_PORT"; port_free_or_ours "$VIATURAS_PORT"
    export SDV_DEMO_TRACE=1 SDV_DEMO_MODE=1
    PORT="$VIATURAS_PORT" start viaturas node apps/viaturas-service/dist/main.js; sleep 5
    PORT="$GATEWAY_PORT" start gateway node apps/gateway/dist/main.js
    for n in $(seq 1 "$WORKERS"); do SDV_WORKER_NAME="W$n" start "worker$n" node apps/dispatch-worker/dist/main.js; done
    sleep 6
    echo "Arena pronta: gateway :$GATEWAY_PORT · viaturas :$VIATURAS_PORT · $WORKERS workers (W1..W$WORKERS)"
    echo "Logs em $RUN/*.log. Frontend: GATEWAY_URL=http://localhost:$GATEWAY_PORT npm run dev:frontend e VITE_DEMO_ARENA=1"
    ;;
  down)
    load_env
    # Restaura viaturas reservadas ANTES de derrubar (precisa do gateway/viaturas no ar). Falha aqui não impede o resto.
    node scripts/arena-restore.mjs "http://localhost:$GATEWAY_PORT/graphql" || echo "Aviso: não foi possível restaurar as viaturas (restaure pela Arena ou veja docs)." >&2
    stop_ours; echo "Processos da arena encerrados. Para voltar ao modo normal, suba os serviços sem SDV_DEMO_*."
    ;;
  status)
    [[ -f "$PIDS" ]] && while read -r pid; do ps -p "$pid" -o pid=,command= 2>/dev/null || true; done < "$PIDS" || echo "Arena não está rodando (por este script)."
    ;;
  *) echo "uso: $0 up [workers] | down | status" >&2; exit 2;;
esac
