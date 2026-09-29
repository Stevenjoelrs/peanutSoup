/**
 * MÓDULO especialista — capa de datos (US-08)
 * -----------------------------------------------------------------------------
 * Contrato preservado:
 *   GET  /api/derivaciones/activas               -> 200 (ordenes del estudiante)
 *   GET  /api/derivaciones/mis-derivaciones      -> 200 (historial)
 *   GET  /api/especialistas/horarios             -> 200 (?id_especialidad=<uuid>)
 *   POST /api/fichas-especialista/reservar        -> 201 | 400 | 404 | 409
 *   GET  /api/fichas/mis-fichas                   -> 200 (comprobante de la ficha)
 */
import { api, conParams } from '../shared/http.js';

export const derivacionesActivas = () => api('/api/derivaciones/activas');

export const misDerivaciones = () => api('/api/derivaciones/mis-derivaciones');

/** Turnos de especialistas; el filtro por especialidad es obligatorio en US-08. */
export const turnosEspecialistas = (idEspecialidad, fecha) =>
  api(
    conParams('/api/especialistas/horarios', {
      id_especialidad: idEspecialidad,
      fecha
    })
  );

/** Canje atómico: la orden pasa a UTILIZADA y el horario se ocupa. */
export const reservarConEspecialista = ({ idHorario, idDerivacion }) =>
  api('/api/fichas-especialista/reservar', {
    method: 'POST',
    body: { id_horario: idHorario, id_derivacion: idDerivacion }
  });

export const misFichas = () => api('/api/fichas/mis-fichas');

export const urlComprobante = (idFicha) => conParams(`/api/fichas/${idFicha}/comprobante`);
