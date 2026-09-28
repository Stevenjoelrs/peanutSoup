import { query } from '../shared/config/db.js';

/**
 * CAPA DE DATOS — módulo de afiliación
 * -----------------------------------------------------------------------------
 * Todo el SQL del módulo vive aquí. No conoce HTTP ni Express: recibe
 * parámetros y devuelve filas. Las reglas de negocio (y los mensajes que
 * forman parte del contrato) están en afiliacion.service.js.
 */

export const buscarEstudiantePorId = async (id_estudiante) => {
  const result = await query(
    `SELECT id_estudiante, sis, cedula_identidad, nombre_completo, facultad, carrera
     FROM estudiantes
     WHERE id_estudiante = $1`,
    [id_estudiante]
  );
  return result.rows[0] ?? null;
};


export const buscarAfiliacionActivaPorPeriodo = async (id_estudiante, periodo_semestral) => {
  const result = await query(
    `SELECT id_afiliacion, periodo_semestral, estado, fecha_vencimiento
     FROM afiliaciones
     WHERE id_estudiante = $1
       AND periodo_semestral = $2
       AND estado = 'ACTIVA'`,
    [id_estudiante, periodo_semestral]
  );
  return result.rows[0] ?? null;
};

export const insertarAfiliacion = async (datos) => {
  const result = await query(
    `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
     VALUES ($1, $2, $3, $4, 'ACTIVA')
     RETURNING id_afiliacion, id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado, created_at`,
    [datos.id_estudiante, datos.periodo_semestral, datos.fecha_inicio, datos.fecha_vencimiento]
  );
  return result.rows[0];
};

/**
 * US-12 — Vigencia de la afiliación más reciente.
 *
 * `estado_efectivo` se deriva en la consulta y no se almacena: "VENCIDA" no es
 * un valor de la columna `estado`, es la lectura de `fecha_vencimiento` contra
 * CURRENT_DATE. Lo mismo con `elegible_renovacion`, que replica aquí la
 * ventana de renovación para que el frontend no tenga que decidirlo.
 */
export const buscarVigencia = async (id_estudiante) => {
  const result = await query(
    `SELECT a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado,
            (a.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer,
            CASE
              WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
              WHEN a.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
              ELSE 'ACTIVA'
            END AS estado_efectivo,
            CASE WHEN (a.fecha_vencimiento - CURRENT_DATE) <= 30 THEN true ELSE false END AS elegible_renovacion,
            CURRENT_DATE AS fecha_servidor
     FROM afiliaciones a
     WHERE a.id_estudiante = $1
     ORDER BY a.fecha_vencimiento DESC
     LIMIT 1`,
    [id_estudiante]
  );
  return result.rows[0] ?? null;
};
