/**
 * SSU - UMSS | Punto de entrada del servidor
 * -----------------------------------------------------------------------------
 * Arranque en 3 pasos: config, composición de la app, escucha del puerto.
 * La arquitectura de módulos vive en `src/shared/modules.js` y la composición
 * Express en `src/shared/app.js` (ver docs/ARQUITECTURA.md).
 *
 *   pnpm dev    ->  node --watch server.js
 *   docker compose up -d --build
 *
 * Este archivo no contiene lógica de negocio: si alguna vez la tuviera, estaría
 * en el lugar equivocado.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createApp } from './src/shared/app.js';
import { checkHealth } from './src/shared/config/db.js';
import { FRONTEND_DIST_DIR } from './src/shared/config/paths.js';

const PORT = process.env.PORT || 3000;

const app = createApp();

const server = app.listen(PORT, async () => {
  console.log('=============================================================');
  console.log(' SSU - UMSS :: API REST + interfaz web');
  console.log(` Interfaz:  http://localhost:${PORT}/`);
  console.log(` Catálogo:  http://localhost:${PORT}/api`);
  console.log(` Salud:     http://localhost:${PORT}/api/system/health`);
  console.log(` Entorno:   ${process.env.NODE_ENV || 'development'}`);
  console.log('=============================================================');

  const frontendListo = fs.existsSync(path.join(FRONTEND_DIST_DIR, 'inicio', 'index.html'));
  if (!frontendListo) {
    console.warn(`[frontend] Sin compilar en ${FRONTEND_DIST_DIR}. Ejecuta \`pnpm build\`.`);
  }

  const dbHealth = await checkHealth();
  if (dbHealth.connected) {
    console.log(`[db] Supabase conectado (${dbHealth.durationMs}ms)`);
  } else {
    console.warn(`[db] No disponible: ${dbHealth.error}`);
    console.warn('[db] -> Revisa DATABASE_URL en tu .env y la red IPv6 de docker-compose.');
  }
});

const cerrar = (senal) => {
  console.log(`\n[${senal}] cerrando servidor SSU...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));

export default app;
