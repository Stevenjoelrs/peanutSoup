#!/bin/sh
# =============================================================================
# SSU - UMSS | Supervisor de desarrollo del monorepo
# -----------------------------------------------------------------------------
# Docker Desktop y WSL2 no entregan de forma fiable los eventos de inotify del
# host a traves de un bind mount, por lo que `node --watch` no detecta los
# cambios. Este supervisor compara hashes del codigo montado en /app y separa
# las dos cosas que puede pasar al editar:
#
#   - cambia frontend/  -> recompila el frontend con Vite
#   - cambia backend/ o db/  -> reinicia el servidor Express
#
# `frontend/dist` queda fuera de ambos hashes: recompilar genera archivos nuevos
# y, si se incluyeran, cada compilacion provocaria un reinicio infinito.
#
# No requiere dependencias adicionales: solo busybox (find/md5sum) y node.
# =============================================================================
set -e

cd /app

LOG_VITE=/tmp/vite-build.log

# -----------------------------------------------------------------------------
# Comprobaciones previas: fallar aqui con un mensaje claro es mejor que dejar
# que Express muera en un bucle de reinicio con ERR_MODULE_NOT_FOUND.
# -----------------------------------------------------------------------------
preflight() {
  if [ ! -d node_modules ]; then
    echo "[dev-watch] ERROR: no existe /app/node_modules."
    echo "  El bind mount oculta la carpeta de dependencias de la imagen y el"
    echo "  volumen que deberia suplirla no esta montado."
    echo "  Solucion: docker compose down -v && docker compose up -d --build"
    exit 1
  fi

  for paquete in backend frontend db; do
    if [ ! -f "$paquete/package.json" ]; then
      echo "[dev-watch] ERROR: falta $paquete/package.json."
      echo "  Solucion: docker compose down -v && docker compose up -d --build"
      exit 1
    fi
  done

  if ! node -e "import('vite').then(() => process.exit(0), () => process.exit(1))" >/dev/null 2>&1; then
    echo "[dev-watch] ERROR: la dependencia de desarrollo 'vite' no esta disponible."
    echo "  El volumen de /app/node_modules quedo obsoleto: se creo desde una"
    echo "  imagen anterior. Sin vite el frontend no se puede compilar."
    echo "  Solucion: docker compose down -v && docker compose up -d --build"
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# Hashes de deteccion de cambios
# -----------------------------------------------------------------------------
hash_servidor() {
  find ./backend ./db \
    -path '*/node_modules' -prune -o \
    -type f -print \
    | sort \
    | xargs md5sum 2>/dev/null \
    | md5sum \
    | cut -d' ' -f1
}

hash_frontend() {
  find ./frontend -path '*/node_modules' -prune -o \
    -path ./frontend/dist -prune -o \
    -type f -print \
    | sort \
    | xargs md5sum 2>/dev/null \
    | md5sum \
    | cut -d' ' -f1
}

# -----------------------------------------------------------------------------
# Acciones
# -----------------------------------------------------------------------------
start_server() {
  node backend/server.js &
  APP_PID=$!
}

rebuild_frontend() {
  echo "[dev-watch] Cambio en el frontend: recompilando con Vite..."
  if pnpm build >"$LOG_VITE" 2>&1; then
    echo "[dev-watch] Frontend recompilado en frontend/dist."
  else
    echo "[dev-watch] ERROR: la compilacion del frontend fallo:"
    tail -n 20 "$LOG_VITE"
  fi
}

trap 'kill "$APP_PID" 2>/dev/null; exit 0' INT TERM

preflight

echo "[dev-watch] Iniciando servidor Express (node $(node -v), pnpm $(pnpm -v))..."
start_server
PREVIO_SERVIDOR=$(hash_servidor)
PREVIO_FRONTEND=$(hash_frontend)

while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 2

  FRONTEND=$(hash_frontend)
  if [ "$FRONTEND" != "$PREVIO_FRONTEND" ]; then
    PREVIO_FRONTEND=$FRONTEND
    rebuild_frontend
  fi

  SERVIDOR=$(hash_servidor)
  if [ "$SERVIDOR" != "$PREVIO_SERVIDOR" ]; then
    PREVIO_SERVIDOR=$SERVIDOR
    echo "[dev-watch] Cambio detectado en el servidor: reiniciando..."
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
    start_server
  fi
done

echo "[dev-watch] El servidor se detuvo."
wait "$APP_PID" 2>/dev/null || true
