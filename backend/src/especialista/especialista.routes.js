import { Router } from 'express';
import {
  listarHorariosDisponibles,
  reservarFichaEspecialista
} from '../reserva/reserva.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

/**
 * US-03 — Catálogo de turnos de medicina general
 * GET /api/medicos/turnos-disponibles
 * Alias de GET /api/fichas/horarios-disponibles restringido a no especialistas.
 */
export const medicosRoutes = Router();

medicosRoutes.get('/turnos-disponibles', (req, res, next) => {
  req.query.solo_especialistas = 'false';
  return listarHorariosDisponibles(req, res, next);
});

/**
 * US-08 — Catálogo de turnos de especialistas
 * GET /api/especialistas/horarios?id_especialidad=<uuid>
 */
export const especialistasRoutes = Router();

especialistasRoutes.get('/horarios', (req, res, next) => {
  req.query.solo_especialistas = 'true';
  return listarHorariosDisponibles(req, res, next);
});

/**
 * US-08 — Reserva de ficha con especialista
 * POST /api/fichas-especialista/reservar
 */
export const fichaEspecialistaRoutes = Router();

fichaEspecialistaRoutes.post('/reservar', authenticateStudent, requireAuth, reservarFichaEspecialista);
