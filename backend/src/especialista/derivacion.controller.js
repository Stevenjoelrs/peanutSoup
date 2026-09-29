import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './derivacion.service.js';

export const listarDerivacionesActivas = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerDerivacionesActivas(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

export const listarTodasDerivacionesEstudiante = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerHistorialDerivaciones(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

export const crearDerivacion = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.emitirDerivacion(req.user.id_estudiante, req.body);
  return successResponse(res, mensaje, data, 201);
});
