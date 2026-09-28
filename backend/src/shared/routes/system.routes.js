import { Router } from 'express';
import { checkHealth } from '../config/db.js';

const router = Router();

/**
 * SSU - UMSS | Health check
 * -----------------------------------------------------------------------------
 * Responde 200 cuando la API y la base de datos están disponibles, y 503 cuando
 * no. Es lo que consulta el `healthcheck` de docker-compose.yml, así que debe
 * ser barato y no debe lanzar excepciones: si la base cae, el proceso tiene que
 * seguir vivo para contestar 503.
 */
router.get('/health', async (req, res) => {
  const health = await checkHealth();
  return res.status(health.connected ? 200 : 503).json({
    status: health.connected ? 'UP' : 'DOWN',
    service: 'SSU-UMSS API',
    database: health,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

export default router;
