import { Router } from 'express';
import {
  reservarFichaGeneral,
  reservarFichaEspecialista,
  listarFichasPorEstudiante,
  obtenerComprobanteFicha,
  cancelarFicha
} from './reserva.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// El catálogo de turnos NO vive en este router. Hay uno por audiencia, porque el
// mismo listado se filtra distinto y filtrar por un parámetro de query que nadie
// manda termina siendo una bandera que se olvida:
//   GET /api/medicos/turnos-disponibles       medicina general
//   GET /api/especialistas/horarios            especialistas
// Ver especialista.routes.js.

// Protegidas: requieren JWT válido
// US-03 — Reserva de Ficha Médica General (id_estudiante desde JWT)
router.post('/reservar', authenticateStudent, requireAuth, reservarFichaGeneral);

// US-08 — Reserva con Especialista — Transacción Atómica (id_estudiante desde JWT)
router.post('/reservar-especialista', authenticateStudent, requireAuth, reservarFichaEspecialista);

// Historial de fichas del estudiante autenticado
router.get('/mis-fichas', authenticateStudent, requireAuth, listarFichasPorEstudiante);

// US-03 / US-08 — Comprobante oficial imprimible de la ficha (solo su titular)
router.get('/:id/comprobante', authenticateStudent, requireAuth, obtenerComprobanteFicha);

// US-07 — Cancelar ficha propia con al menos 2h de anticipación
router.post('/:id/cancelar', authenticateStudent, requireAuth, cancelarFicha);

export default router;
