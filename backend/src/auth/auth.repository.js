import { query } from '../shared/config/db.js';

/**
 * CAPA DE DATOS — módulo de autenticación
 * -----------------------------------------------------------------------------
 * Todo el SQL del módulo vive aquí. No conoce HTTP ni Express: recibe
 * parámetros y devuelve filas.
 */

/**
 * Buscar estudiante por SIS y Cédula de Identidad.
 * Incluye la última afiliación vigente (LATERAL JOIN).
 * @param {string} sis
 * @param {string} cedula_identidad
 * @returns {Promise<object|null>}
 */
export const buscarEstudiantePorCredenciales = async (sis, cedula_identidad) => {
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
    [sis, cedula_identidad]
  );
  return result.rows[0] ?? null;
};

/**
 * Buscar estudiante por id_estudiante (para /me).
 * Incluye la última afiliación vigente y elegibilidad de renovación.
 * @param {string} id_estudiante UUID del estudiante
 * @returns {Promise<object|null>}
 */
export const buscarEstudiantePorId = async (id_estudiante) => {
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
  return result.rows[0] ?? null;
};
