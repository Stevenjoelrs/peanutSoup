import { Router } from 'express';
import {
  listarHorariosDisponibles,
  reservarFichaGeneral,
  reservarFichaEspecialista,
  listarFichasPorEstudiante,
  obtenerComprobanteFicha
} from './reserva.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// Pública: consultar horarios disponibles (no requiere login para listar)
router.get('/horarios-disponibles', listarHorariosDisponibles);

// Protegidas: requieren JWT válido
// US-03 — Reserva de Ficha Médica General (id_estudiante desde JWT)
router.post('/reservar', authenticateStudent, requireAuth, reservarFichaGeneral);

// US-08 — Reserva con Especialista — Transacción Atómica (id_estudiante desde JWT)
router.post('/reservar-especialista', authenticateStudent, requireAuth, reservarFichaEspecialista);

// Historial de fichas del estudiante autenticado
router.get('/mis-fichas', authenticateStudent, requireAuth, listarFichasPorEstudiante);

// US-03 / US-08 — Comprobante oficial imprimible de la ficha (solo su titular)
router.get('/:id/comprobante', authenticateStudent, requireAuth, obtenerComprobanteFicha);

export default router;
