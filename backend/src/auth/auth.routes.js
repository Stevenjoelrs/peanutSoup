import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginEstudiante, getMe, logoutEstudiante } from './auth.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

/**
 * Limitador de intentos para evitar ataques de fuerza bruta y credential stuffing.
 * Permite hasta 10 intentos por IP cada 15 minutos.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesión. Por favor, intente nuevamente en 15 minutos.',
    error: null,
    timestamp: new Date().toISOString()
  }
});

// POST /api/auth/login — Autenticación por SIS + Cédula de Identidad con protección brute-force
router.post('/login', loginLimiter, loginEstudiante);

// GET /api/auth/me — Datos del estudiante autenticado (requiere JWT válido)
router.get('/me', authenticateStudent, requireAuth, getMe);

// POST /api/auth/logout — Logout simbólico (JWT stateless, invalidación en cliente)
router.post('/logout', authenticateStudent, requireAuth, logoutEstudiante);

export default router;
