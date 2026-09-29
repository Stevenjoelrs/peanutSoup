import { Router } from 'express';
import { loginEstudiante, getMe, logoutEstudiante } from './auth.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// POST /api/auth/login — Autenticación por SIS + Cédula de Identidad
router.post('/login', loginEstudiante);

// GET /api/auth/me — Datos del estudiante autenticado (requiere JWT válido)
router.get('/me', authenticateStudent, requireAuth, getMe);

// POST /api/auth/logout — Logout simbólico (JWT stateless, invalidación en cliente)
router.post('/logout', authenticateStudent, requireAuth, logoutEstudiante);

export default router;
