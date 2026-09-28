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

/**
 * US-01 — Busca por la matrícula que envía el cliente. Es el único punto del
 * módulo donde la identidad entra desde fuera: mientras no exista sesión, es la
 * forma de resolver al titular. La sesión (JWT) lo sustituye más adelante y esta
 * función deja de usarse en el camino de alta.
 */
export const buscarEstudiantePorSis = async (sis) => {
  const result = await query(
    `SELECT id_estudiante, sis, cedula_identidad, nombre_completo, facultad, carrera
     FROM estudiantes
     WHERE sis = $1`,
    [sis]
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
