import { query } from '../shared/config/db.js';

/**
 * CAPA DE DATOS — módulo de estudiantes
 * -----------------------------------------------------------------------------
 * Todo el SQL del padrón de estudiantes vive aquí.
 * Consultas parametrizadas que devuelven filas o null.
 */

/**
 * Listar todos los estudiantes ordenados por nombre completo con su última afiliación.
 * @returns {Promise<Array<object>>}
 */
export const obtenerTodos = async () => {
  const result = await query(`
    SELECT e.id_estudiante, e.sis, e.cedula_identidad, e.nombre_completo, e.facultad, e.carrera, e.created_at,
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
    ORDER BY e.nombre_completo ASC;
  `);
  return result.rows;
};

/**
 * Buscar un estudiante por SIS, cédula de identidad o UUID.
 * @param {string} termino
 * @returns {Promise<object|null>}
 */
export const buscarPorTermino = async (termino) => {
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
     WHERE e.sis = $1 OR e.cedula_identidad = $1 OR e.id_estudiante::text = $1
     LIMIT 1`,
    [termino]
  );
  return result.rows[0] ?? null;
};

/**
 * Insertar un nuevo estudiante en el padrón.
 * @param {object} datos
 * @returns {Promise<object>}
 */
export const insertarEstudiante = async ({ sis, cedula_identidad, nombre_completo, facultad, carrera }) => {
  const result = await query(
    `INSERT INTO estudiantes (sis, cedula_identidad, nombre_completo, facultad, carrera)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_estudiante, sis, cedula_identidad, nombre_completo, facultad, carrera, created_at`,
    [sis, cedula_identidad, nombre_completo, facultad, carrera]
  );
  return result.rows[0];
};
