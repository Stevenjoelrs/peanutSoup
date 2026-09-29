import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './estudiantes.service.js';

export const listarEstudiantes = manejar(async (req, res) => {
  const estudiantes = await servicio.listarEstudiantes();
  return successResponse(res, 'Lista de estudiantes obtenida.', estudiantes);
});

export const buscarEstudiante = manejar(async (req, res) => {
  const estudiante = await servicio.buscarEstudiante(req.params.termino);
  return successResponse(res, 'Estudiante encontrado.', estudiante);
});

export const crearEstudiante = manejar(async (req, res) => {
  const nuevoEstudiante = await servicio.registrarEstudiante(req.body);
  return successResponse(res, 'Estudiante registrado correctamente.', nuevoEstudiante, 201);
});
