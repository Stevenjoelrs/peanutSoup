import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './estudiantes.service.js';

/**
 * CAPA HTTP — módulo de estudiantes
 * -----------------------------------------------------------------------------
 * Los controladores solo traducen HTTP <-> servicio. Toda regla de negocio
 * y consultas SQL viven en las capas inferiores (service y repository).
 */

/**
 * GET /api/estudiantes
 * Listar todos los estudiantes con su estado de afiliación más reciente.
 */
export const listarEstudiantes = manejar(async (req, res) => {
  const estudiantes = await servicio.listarEstudiantes();
  return successResponse(res, 'Lista de estudiantes obtenida.', estudiantes);
});

/**
 * GET /api/estudiantes/buscar/:termino
 * Buscar estudiante por SIS, CI o id.
 */
export const buscarEstudiante = manejar(async (req, res) => {
  const estudiante = await servicio.buscarEstudiante(req.params.termino);
  return successResponse(res, 'Estudiante encontrado.', estudiante);
});

/**
 * POST /api/estudiantes
 * Registrar nuevo estudiante en el padrón.
 */
export const crearEstudiante = manejar(async (req, res) => {
  const nuevoEstudiante = await servicio.registrarEstudiante(req.body);
  return successResponse(res, 'Estudiante registrado correctamente.', nuevoEstudiante, 201);
});
