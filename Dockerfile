# =============================================================================
# SSU - UMSS | Imagen del monorepo completo
# -----------------------------------------------------------------------------
# El contenedor corre la API Express y sirve el build del frontend. No incluye
# base de datos: la conexion sale hacia Supabase Cloud por SSL.
#
#   - Node.js 24 + pnpm 12.4.2, ambos dentro de la imagen
#   - Dependencias de los tres workspaces instaladas en la imagen
#   - frontend/dist compilado en la imagen para que el contenedor sea autonomo
#
# En desarrollo, docker-compose.yml monta el codigo del host sobre /app y
# docker/dev-watch.sh recompila y reinicia al detectar cambios.
# =============================================================================
FROM node:24-alpine

# curl (healthcheck), tzdata (hora de Bolivia) y pnpm en su version fijada
RUN apk add --no-cache curl tzdata \
    && npm install -g pnpm@12.4.2 \
    && pnpm store prune \
    && npm cache clean --force

# Zona horaria: Bolivia / Cochabamba (UTC-4)
ENV TZ=America/La_Paz

WORKDIR /app

# ---------------------------------------------------------------------------
# Capa cacheable: primero SOLO los manifiestos de dependencias, de modo que un
# cambio de codigo no vuelva a descargar paquetes. El orden de los COPY importa:
# pnpm necesita ver pnpm-workspace.yaml y los package.json de cada paquete.
# ---------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY db/package.json ./db/

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Codigo fuente de los tres paquetes
# ---------------------------------------------------------------------------
COPY backend ./backend
COPY frontend ./frontend
COPY db ./db
COPY docker/dev-watch.sh /usr/local/bin/ssu-dev-watch

RUN chmod +x /usr/local/bin/ssu-dev-watch

# Frontend compilado dentro de la imagen. Con el bind mount de docker-compose
# este dist/ queda tapado por el del host, y entonces lo recompila el supervisor
# al detectar cambios en frontend/src.
RUN pnpm build

EXPOSE 3000

ENV NODE_ENV=development
ENV PORT=3000

# El supervisor reinicia el servidor Express ante cambios en backend/ o db/ y
# recompila el frontend ante cambios en frontend/.
CMD ["ssu-dev-watch"]
