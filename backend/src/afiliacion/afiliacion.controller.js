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
 *
 * El estudiante se identifica por su matrícula porque todavía no hay sesión.
 */
export const afiliarEstudiante = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.registrarAfiliacion({
    sis: req.body.sis,
    periodo_semestral: req.body.periodo_semestral,
    fecha_inicio: req.body.fecha_inicio,
    fecha_vencimiento: req.body.fecha_vencimiento
  });
  return successResponse(res, mensaje, data, 201);
});
