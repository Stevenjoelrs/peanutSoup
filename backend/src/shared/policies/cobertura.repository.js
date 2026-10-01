/**
 * SSU - UMSS | Repositorio de la política de cobertura
 * -----------------------------------------------------------------------------
 * SQL puro para `requireCoberturaActiva`. La fecha de corte se calcula en
 * America/La_Paz y no con CURRENT_DATE (que usa la zona de la sesión PG,
 * UTC en Supabase, y adelanta el vencimiento ~4h).
 */
const HOY_LP = `(now() AT TIME ZONE 'America/La_Paz')::date`;

/**
 * Afiliación vigente: ACTIVA y hoy dentro de [fecha_inicio, fecha_vencimiento].
 * Con FOR UPDATE para serializar contra renovarAfiliacion (inactivar+insertar).
 */
export const buscarCoberturaVigente = async (client, id_estudiante) => {
  const result = await client.query(
    `SELECT a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado,
            (a.fecha_vencimiento - ${HOY_LP}) AS dias_para_vencer
      FROM afiliaciones a
      WHERE a.id_estudiante = $1
        AND a.estado = 'ACTIVA'
        AND a.fecha_inicio <= ${HOY_LP}
        AND a.fecha_vencimiento >= ${HOY_LP}
      ORDER BY a.fecha_vencimiento DESC
      LIMIT 1
      FOR UPDATE OF a`,
    [id_estudiante]
  );
  return result.rows[0] || null;
};

/**
 * Última afiliación sin filtros, solo para diferenciar el mensaje del 403
 * (SIN_AFILIACION / INACTIVA / VENCIDA / FUTURA). Sin lock: es de lectura.
 */
export const describirUltimaAfiliacion = async (client, id_estudiante) => {
  const result = await client.query(
    `SELECT a.estado, a.fecha_inicio, a.fecha_vencimiento,
            (a.fecha_vencimiento - ${HOY_LP}) AS dias_para_vencer
      FROM afiliaciones a
      WHERE a.id_estudiante = $1
      ORDER BY a.fecha_vencimiento DESC
      LIMIT 1`,
    [id_estudiante]
  );
  return result.rows[0] || null;
};
