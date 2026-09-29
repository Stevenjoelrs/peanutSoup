import { Router } from 'express';
import {
  listarEstudiantes,
  buscarEstudiante,
  crearEstudiante
} from './estudiantes.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

router.use(authenticateStudent, requireAuth);

router.get('/', listarEstudiantes);
router.get('/buscar/:termino', buscarEstudiante);
router.post('/', crearEstudiante);

export default router;
