import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './derivacion.service.js';

/**
 * CAPA HTTP — módulo de especialista / órdenes de derivación
 * -----------------------------------------------------------------------------
 * Los controladores solo traducen HTTP <-> servicio. Toda regla de negocio
 * y consultas SQL viven en las capas inferiores (service y repository).
 */

/**
 * US-08 — Consultar órdenes de derivación activas
 * Filtra ÚNICAMENTE las derivaciones del id_estudiante autenticado (req.user).
 */
export const listarDerivacionesActivas = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerDerivacionesActivas(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

/**
 * Listar todas las derivaciones del estudiante autenticado (historial completo)
 */
export const listarTodasDerivacionesEstudiante = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerHistorialDerivaciones(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

/**
 * Crear nueva orden de derivación (Facilitador para pruebas)
 */
export const crearDerivacion = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.emitirDerivacion(req.user.id_estudiante, req.body);
  return successResponse(res, mensaje, data, 201);
});
