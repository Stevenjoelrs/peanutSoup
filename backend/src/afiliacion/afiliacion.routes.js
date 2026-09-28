import { Router } from 'express';
import { afiliarEstudiante } from './afiliacion.controller.js';

const router = Router();

// US-01 — Afiliación Semestral
router.post('/', afiliarEstudiante);

// US-01 — Alias funcional
router.post('/solicitar', afiliarEstudiante);

export default router;
