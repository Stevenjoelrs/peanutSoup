import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './auth.service.js';

/**
 * CAPA HTTP — módulo de autenticación
 * -----------------------------------------------------------------------------
 * Los controladores solo traducen HTTP <-> servicio. Toda regla de negocio y
 * todo SQL viven en las capas inferiores (auth.service.js y auth.repository.js).
 */

/**
 * POST /api/auth/login
 * Autenticación de Estudiante SSU - UMSS
 * Valida credenciales (sis + cedula_identidad) consultando la tabla estudiantes.
 * Si son válidas, retorna los datos del estudiante y un JWT firmado.
 */
export const loginEstudiante = manejar(async (req, res) => {
  const { sis, cedula_identidad } = req.body;
  const { mensaje, data } = await servicio.autenticar(sis, cedula_identidad);
  return successResponse(res, mensaje, data, 200);
});

/**
 * GET /api/auth/me
 * Retorna los datos del estudiante actualmente autenticado (desde el token).
 * Requiere middleware requireAuth aplicado en la ruta.
 */
export const getMe = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerPerfil(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

/**
 * POST /api/auth/logout
 * JWT es stateless — el logout se maneja en el cliente eliminando el token.
 * Este endpoint solo confirma la acción para UX y registro de auditoría.
 */
export const logoutEstudiante = (req, res) => {
  return successResponse(res, 'Sesión cerrada exitosamente. El token ha sido invalidado en el cliente.');
};
