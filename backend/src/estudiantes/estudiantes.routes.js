import { Router } from 'express';
import {
  listarEstudiantes,
  buscarEstudiante,
  crearEstudiante
} from './estudiantes.controller.js';

const router = Router();

router.get('/', listarEstudiantes);
router.get('/buscar/:termino', buscarEstudiante);
router.post('/', crearEstudiante);

export default router;
