import { Router } from 'express';
import {
  listarEstudiantes,
  buscarEstudiante,
  crearEstudiante
} from './estudiantes.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// CRIT-04: Exigir autenticación válida en todos los endpoints de acceso al padrón
router.use(authenticateStudent, requireAuth);

router.get('/', listarEstudiantes);
router.get('/buscar/:termino', buscarEstudiante);
router.post('/', crearEstudiante);

export default router;
