import { Router } from 'express';
import { crearLimitador } from '../shared/middleware/rateLimiter.js';
import { loginEstudiante, getMe, logoutEstudiante } from './auth.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

const loginLimiter = crearLimitador({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesión. Por favor, intente nuevamente en 15 minutos.',
    error: null
  }
});

router.post('/login', loginLimiter, loginEstudiante);
router.get('/me', authenticateStudent, requireAuth, getMe);
router.post('/logout', authenticateStudent, requireAuth, logoutEstudiante);

export default router;
