import { Router } from 'express';
import {
  afiliarEstudiante,
  renovarAfiliacion,
  consultarVigenciaAfiliacion
} from './afiliacion.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// Toda la ruta exige sesión: la identidad nunca viaja en el cuerpo.
router.use(authenticateStudent, requireAuth);

// US-01 — Afiliación Semestral (id_estudiante desde JWT)
router.post('/', afiliarEstudiante);

// US-01 — Alias funcional
router.post('/solicitar', afiliarEstudiante);

// US-12 — Renovación de Afiliación (id_estudiante desde JWT)
router.post('/renovar', renovarAfiliacion);

// US-12 — Vigencia actual de la cobertura (fecha de término y elegibilidad)
router.get('/vigencia', consultarVigenciaAfiliacion);

export default router;
