import { Router } from 'express';
import {
  listarDerivacionesActivas,
  listarTodasDerivacionesEstudiante,
  crearDerivacion
} from './derivacion.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// Todas las rutas de derivaciones requieren autenticación
router.use(authenticateStudent, requireAuth);

// US-08: Derivaciones activas del estudiante autenticado
router.get('/activas', listarDerivacionesActivas);

// Historial completo de derivaciones del estudiante autenticado
router.get('/mis-derivaciones', listarTodasDerivacionesEstudiante);

// Crear nueva derivación (id_estudiante desde JWT)
router.post('/', crearDerivacion);

export default router;
