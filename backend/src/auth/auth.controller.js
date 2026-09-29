import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './auth.service.js';

export const loginEstudiante = manejar(async (req, res) => {
  const { sis, cedula_identidad } = req.body;
  const { mensaje, data } = await servicio.autenticar(sis, cedula_identidad);
  return successResponse(res, mensaje, data, 200);
});

export const getMe = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerPerfil(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

export const logoutEstudiante = (req, res) => {
  return successResponse(res, 'Sesión cerrada exitosamente.');
};
