import { Router } from 'express';
import {
  listarMisOrdenes,
  obtenerOrden,
  descargarResultado
} from './laboratorio.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

/**
 * Todas las rutas de laboratorio requieren autenticación de estudiante.
 * El middleware authenticateStudent llena req.user y requireAuth responde 401 si no hay sesión.
 */
router.use(authenticateStudent, requireAuth);

/**
 * GET /api/laboratorio/mis-ordenes
 * Lista todas las órdenes del estudiante autenticado.
 */
router.get('/mis-ordenes', listarMisOrdenes);

/**
 * GET /api/laboratorio/ordenes/:id
 * Detalle de una orden específica (incluye resultado si existe).
 */
router.get('/ordenes/:id', obtenerOrden);

/**
 * GET /api/laboratorio/ordenes/:id/resultado
 * Devuelve la URL del archivo de resultado (solo si estado = FINALIZADA).
 */
router.get('/ordenes/:id/resultado', descargarResultado);

export default router;