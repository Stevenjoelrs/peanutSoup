/**
 * MÓDULO reserva — capa de datos (US-03)
 * -----------------------------------------------------------------------------
 * Contrato preservado:
 *   GET  /api/medicos/turnos-disponibles        -> 200 (turnos de medicina general)
 *   GET  /api/fichas/mis-fichas                  -> 200 (fichas del estudiante)
 *   POST /api/fichas/reservar                    -> 201 | 400 | 404 | 409
 *   GET  /api/fichas/:id/comprobante             -> 200 (HTML imprimible)
 *   POST /api/fichas/:id/cancelar                 -> 200 | 403 | 404 | 409
 *
 * La reserva nunca envía id_estudiante: el servidor lo toma del JWT.
 */
import { api, conParams } from '../shared/http.js';

/** Turnos de medicina general disponibles (opcionalmente filtrados por fecha). */
export const turnosDisponibles = (fecha) =>
  api(conParams('/api/medicos/turnos-disponibles', fecha ? { fecha } : {}));

/** Fichas reservadas del estudiante autenticado. */
export const misFichas = () => api('/api/fichas/mis-fichas');

/** Reserva la ficha general sobre un horario concreto. */
export const reservarFicha = (idHorario) =>
  api('/api/fichas/reservar', { method: 'POST', body: { id_horario: idHorario } });

export const urlComprobante = (idFicha) => conParams(`/api/fichas/${idFicha}/comprobante`);

/** Cancela una ficha propia (US-07). */
export const cancelarFicha = (idFicha) =>
  api(`/api/fichas/${idFicha}/cancelar`, { method: 'POST' });
