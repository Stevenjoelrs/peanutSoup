import { query, conTransaccion } from '../shared/config/db.js';

/**
 * CAPA DE DATOS — módulo de afiliación
 * -----------------------------------------------------------------------------
 * Todo el SQL del módulo vive aquí. No conoce HTTP ni Express: recibe
 * parámetros y devuelve filas. Las reglas de negocio (y los mensajes que
 * forman parte del contrato) están en afiliacion.service.js.
 *
 * Fechas (Fase 3): `fecha_inicio`/`fecha_vencimiento` son DATE = calendario.
 * El "hoy" se calcula en America/La_Paz y no con CURRENT_DATE (zona de la
 * sesión PG, UTC en Supabase, que adelanta el vencimiento ~4h).
 */
const HOY_LP = `(now() AT TIME ZONE 'America/La_Paz')::date`;

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
 * el hoy de La Paz. Lo mismo con `elegible_renovacion`, que replica aquí la
 * ventana cerrada de renovación (0 a 30 días) para que el frontend no tenga
 * que decidirlo.
 */
export const buscarVigencia = async (id_estudiante) => {
  const result = await query(
    `SELECT a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado,
            (a.fecha_vencimiento - ${HOY_LP}) AS dias_para_vencer,
            CASE
              WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
              WHEN a.fecha_vencimiento < ${HOY_LP} THEN 'VENCIDA'
              ELSE 'ACTIVA'
            END AS estado_efectivo,
            CASE WHEN (a.fecha_vencimiento - ${HOY_LP}) BETWEEN 0 AND 30 THEN true ELSE false END AS elegible_renovacion,
            (${HOY_LP}) AS fecha_servidor
     FROM afiliaciones a
     WHERE a.id_estudiante = $1
     ORDER BY a.fecha_vencimiento DESC
     LIMIT 1`,
    [id_estudiante]
  );
  return result.rows[0] ?? null;
};

/** US-12 — Última afiliación vigente, con los días que le quedan. */
export const buscarUltimaAfiliacionActiva = async (client, id_estudiante) => {
  const resultado = await client.query(
    `SELECT a.id_afiliacion, a.id_estudiante, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento,
            a.estado, (a.fecha_vencimiento - ${HOY_LP}) AS dias_para_vencer,
            e.nombre_completo, e.sis
     FROM afiliaciones a
     JOIN estudiantes e ON a.id_estudiante = e.id_estudiante
     WHERE a.id_estudiante = $1
       AND a.estado = 'ACTIVA'
     ORDER BY a.fecha_vencimiento DESC
     LIMIT 1`,
    [id_estudiante]
  );
  return resultado.rows[0] ?? null;
};

export const inactivarAfiliacion = async (client, id_afiliacion) => {
  await client.query(`UPDATE afiliaciones SET estado = 'INACTIVA' WHERE id_afiliacion = $1`, [id_afiliacion]);
};

/** Inserción con el cliente de la transacción: comparte el mismo bloqueo. */
export const insertarAfiliacionConCliente = async (client, datos) => {
  const resultado = await client.query(
    `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
     VALUES ($1, $2, $3, $4, 'ACTIVA')
     RETURNING id_afiliacion, id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado, created_at`,
    [datos.id_estudiante, datos.periodo_semestral, datos.fecha_inicio, datos.fecha_vencimiento]
  );
  return resultado.rows[0];
};

/**
 * Transacción atómica: cierra la afiliación anterior y abre la nueva, o no pasa
 * ninguna de las dos. Reexportada desde la capa de datos compartida: el único
 * que pide el cliente del pool es src/shared/config/db.js.
 */
export { conTransaccion };
