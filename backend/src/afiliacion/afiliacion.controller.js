import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './afiliacion.service.js';

/**
 * CAPA HTTP — módulo de afiliación (US-01)
 * -----------------------------------------------------------------------------
 * Los controladores solo traducen HTTP <-> servicio. Toda regla de negocio y
 * todo SQL viven en las capas inferiores (afiliacion.service.js y
 * afiliacion.repository.js).
 */

/**
 * US-01 — POST /api/afiliaciones  y  POST /api/afiliaciones/solicitar
 * El id_estudiante se toma SIEMPRE del JWT (req.user), nunca del body.
 */
export const afiliarEstudiante = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.registrarAfiliacion({
    id_estudiante: req.user.id_estudiante,
    periodo_semestral: req.body.periodo_semestral,
    fecha_inicio: req.body.fecha_inicio,
    fecha_vencimiento: req.body.fecha_vencimiento
  });
  return successResponse(res, mensaje, data, 201);
});

/** US-12 — GET /api/afiliaciones/vigencia */
export const consultarVigenciaAfiliacion = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.consultarVigencia(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

/** US-12 — POST /api/afiliaciones/renovar */
export const renovarAfiliacion = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.renovarAfiliacion({
    id_estudiante: req.user.id_estudiante,
    nuevo_periodo_semestral: req.body.nuevo_periodo_semestral,
    nueva_fecha_inicio: req.body.nueva_fecha_inicio,
    nueva_fecha_vencimiento: req.body.nueva_fecha_vencimiento
  });
  return successResponse(res, mensaje, data, 201);
});
