import { query } from '../shared/config/db.js';
import { generateToken } from '../shared/middleware/auth.js';
import { successResponse, errorResponse } from '../shared/http/response.js';

/**
 * POST /api/auth/login
 * Autenticación de Estudiante SSU - UMSS
 * Valida credenciales (sis + cedula_identidad) consultando la tabla estudiantes.
 * Si son válidas, retorna los datos del estudiante y un JWT firmado.
 */
export const loginEstudiante = async (req, res, next) => {
  try {
    const { sis, cedula_identidad } = req.body;

    if (!sis || !cedula_identidad) {
      return errorResponse(
        res,
        'El código SIS y la Cédula de Identidad son obligatorios para iniciar sesión.',
        400
      );
    }

    // Consulta SQL nativa: buscar estudiante con AMBAS credenciales coincidentes
    const result = await query(
      `SELECT e.id_estudiante, e.sis, e.cedula_identidad, e.nombre_completo, e.facultad, e.carrera, e.created_at,
              a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado AS estado_afiliacion,
              CASE
                WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
                WHEN a.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
                ELSE 'ACTIVA'
              END AS estado_afiliacion_efectivo,
              (a.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer
       FROM estudiantes e
       LEFT JOIN LATERAL (
         SELECT id_afiliacion, periodo_semestral, fecha_inicio, fecha_vencimiento, estado
         FROM afiliaciones
         WHERE id_estudiante = e.id_estudiante
         ORDER BY fecha_vencimiento DESC
         LIMIT 1
       ) a ON TRUE
       WHERE e.sis = $1 AND e.cedula_identidad = $2`,
      [sis.trim(), cedula_identidad.trim()]
    );

    if (result.rows.length === 0) {
      return errorResponse(
        res,
        'Credenciales incorrectas. Verifique su código SIS y Cédula de Identidad.',
        401
      );
    }

    const estudiante = result.rows[0];

    // Payload del JWT — incluye todos los campos necesarios para los 5 flujos
    const tokenPayload = {
      id_estudiante: estudiante.id_estudiante,
      sis: estudiante.sis,
      nombre_completo: estudiante.nombre_completo,
      facultad: estudiante.facultad,
      carrera: estudiante.carrera
    };

    const token = generateToken(tokenPayload);

    return successResponse(
      res,
      `Inicio de sesión exitoso. Bienvenido al SSU, ${estudiante.nombre_completo}.`,
      {
        token,
        estudiante: {
          id_estudiante: estudiante.id_estudiante,
          sis: estudiante.sis,
          nombre_completo: estudiante.nombre_completo,
          facultad: estudiante.facultad,
          carrera: estudiante.carrera,
          afiliacion: estudiante.id_afiliacion
            ? {
                id_afiliacion: estudiante.id_afiliacion,
                periodo_semestral: estudiante.periodo_semestral,
                fecha_inicio: estudiante.fecha_inicio,
                fecha_vencimiento: estudiante.fecha_vencimiento,
                estado: estudiante.estado_afiliacion,
                estado_efectivo: estudiante.estado_afiliacion_efectivo,
                dias_para_vencer: estudiante.dias_para_vencer !== null
                  ? parseInt(estudiante.dias_para_vencer, 10)
                  : null,
                estado_cuenta: estudiante.estado_afiliacion_efectivo === 'ACTIVA'
                  ? 'Afiliado con cobertura activa'
                  : estudiante.estado_afiliacion_efectivo === 'VENCIDA'
                    ? 'Afiliación vencida'
                    : 'Sin cobertura activa'
              }
            : null
        }
      },
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Retorna los datos del estudiante actualmente autenticado (desde el token).
 * Requiere middleware requireAuth aplicado en la ruta.
 */
export const getMe = async (req, res, next) => {
  try {
    const { id_estudiante } = req.user;

    const result = await query(
      `SELECT e.id_estudiante, e.sis, e.cedula_identidad, e.nombre_completo, e.facultad, e.carrera, e.created_at,
              a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado AS estado_afiliacion,
              (a.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer,
              CASE
                WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
                WHEN a.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
                ELSE 'ACTIVA'
              END AS estado_afiliacion_efectivo,
              CASE WHEN (a.fecha_vencimiento - CURRENT_DATE) <= 30 THEN true ELSE false END AS elegible_renovacion
       FROM estudiantes e
       LEFT JOIN LATERAL (
         SELECT id_afiliacion, periodo_semestral, fecha_inicio, fecha_vencimiento, estado
         FROM afiliaciones
         WHERE id_estudiante = e.id_estudiante
         ORDER BY fecha_vencimiento DESC
         LIMIT 1
       ) a ON TRUE
       WHERE e.id_estudiante = $1`,
      [id_estudiante]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Estudiante no encontrado.', 404);
    }

    const est = result.rows[0];
    return successResponse(res, 'Datos del estudiante autenticado.', {
      id_estudiante: est.id_estudiante,
      sis: est.sis,
      nombre_completo: est.nombre_completo,
      facultad: est.facultad,
      carrera: est.carrera,
      afiliacion: est.id_afiliacion
        ? {
            id_afiliacion: est.id_afiliacion,
            periodo_semestral: est.periodo_semestral,
            fecha_vencimiento: est.fecha_vencimiento,
            estado: est.estado_afiliacion,
            estado_efectivo: est.estado_afiliacion_efectivo,
            dias_para_vencer: est.dias_para_vencer !== null
              ? parseInt(est.dias_para_vencer, 10)
              : null,
            elegible_renovacion: est.elegible_renovacion,
            estado_cuenta: est.estado_afiliacion_efectivo === 'ACTIVA'
              ? 'Afiliado con cobertura activa'
              : est.estado_afiliacion_efectivo === 'VENCIDA'
                ? 'Afiliación vencida'
                : 'Sin cobertura activa'
          }
        : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * JWT es stateless — el logout se maneja en el cliente eliminando el token.
 * Este endpoint solo confirma la acción para UX y registro de auditoría.
 */
export const logoutEstudiante = (req, res) => {
  return successResponse(res, 'Sesión cerrada exitosamente. El token ha sido invalidado en el cliente.');
};
