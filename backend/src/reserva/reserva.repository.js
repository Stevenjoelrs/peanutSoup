import { query, conTransaccion } from '../shared/config/db.js';

export { conTransaccion };

export const obtenerComprobantePorId = async (id_ficha) => {
  const result = await query(
    `SELECT f.id_ficha, f.id_estudiante, f.id_horario, f.tipo_ficha, f.estado, f.fecha_reserva,
            h.fecha, h.hora_inicio, h.hora_fin, h.consultorio,
            m.nombre_completo AS medico_nombre, m.es_especialista,
            esp.nombre AS especialidad_nombre,
            e.nombre_completo AS estudiante_nombre, e.sis AS estudiante_sis,
            e.facultad, e.carrera
     FROM fichas_reservadas f
     JOIN horarios_atencion h ON f.id_horario = h.id_horario
     JOIN medicos m ON h.id_medico = m.id_medico
     LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
     JOIN estudiantes e ON f.id_estudiante = e.id_estudiante
     WHERE f.id_ficha = $1`,
    [id_ficha]
  );
  return result.rows[0] ?? null;
};

export const obtenerHorariosDisponibles = async ({ solo_especialistas, id_especialidad, fecha }) => {
  let sql = `
    SELECT h.id_horario, h.id_medico, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio, h.disponible,
           m.nombre_completo AS medico_nombre, m.es_especialista,
           m.id_especialidad, esp.nombre AS especialidad_nombre
    FROM horarios_atencion h
    JOIN medicos m ON h.id_medico = m.id_medico
    LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
    WHERE h.disponible = TRUE
      AND h.fecha >= CURRENT_DATE
  `;
  const params = [];

  if (solo_especialistas === 'true') {
    params.push(true);
    sql += ` AND m.es_especialista = $${params.length}`;
  } else if (solo_especialistas === 'false') {
    params.push(false);
    sql += ` AND m.es_especialista = $${params.length}`;
  }

  if (id_especialidad) {
    params.push(id_especialidad);
    sql += ` AND m.id_especialidad = $${params.length}`;
  }

  if (fecha) {
    params.push(fecha);
    sql += ` AND h.fecha = $${params.length}`;
  }

  sql += ` ORDER BY h.fecha ASC, h.hora_inicio ASC`;

  const result = await query(sql, params);
  return result.rows;
};

export const bloquearHorario = async (client, id_horario) => {
  const result = await client.query(
    `SELECT h.id_horario, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio, h.disponible,
            m.nombre_completo AS medico_nombre, m.es_especialista, m.id_especialidad,
            esp.nombre AS especialidad_nombre,
            esp.nombre AS especialidad_medico_nombre
     FROM horarios_atencion h
     JOIN medicos m ON h.id_medico = m.id_medico
     LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
     WHERE h.id_horario = $1
     FOR UPDATE OF h`,
    [id_horario]
  );
  return result.rows[0] ?? null;
};

export const obtenerEstudianteTransaccional = async (client, id_estudiante) => {
  const result = await client.query(
    `SELECT id_estudiante, sis, nombre_completo FROM estudiantes WHERE id_estudiante = $1`,
    [id_estudiante]
  );
  return result.rows[0] ?? null;
};

export const buscarFichaMismaFecha = async (client, id_estudiante, fecha) => {
  const result = await client.query(
    `SELECT f.id_ficha, f.tipo_ficha, f.estado, h.fecha, h.hora_inicio
     FROM fichas_reservadas f
     JOIN horarios_atencion h ON f.id_horario = h.id_horario
     WHERE f.id_estudiante = $1
       AND h.fecha = $2
       AND f.estado <> 'CANCELADA_USUARIO'
     FOR UPDATE`,
    [id_estudiante, fecha]
  );
  return result.rows[0] ?? null;
};

export const marcarHorarioNoDisponible = async (client, id_horario) => {
  await client.query(
    `UPDATE horarios_atencion SET disponible = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id_horario = $1`,
    [id_horario]
  );
};

export const insertarFicha = async (client, { id_estudiante, id_horario, tipo_ficha, estado = 'RESERVADA' }) => {
  const result = await client.query(
    `INSERT INTO fichas_reservadas (id_estudiante, id_horario, tipo_ficha, estado)
     VALUES ($1, $2, $3, $4)
     RETURNING id_ficha, id_estudiante, id_horario, tipo_ficha, estado, fecha_reserva`,
    [id_estudiante, id_horario, tipo_ficha, estado]
  );
  return result.rows[0];
};

export const bloquearDerivacionEstudiante = async (client, id_derivacion, id_estudiante) => {
  const result = await client.query(
    `SELECT d.id_derivacion, d.id_estudiante, d.estado, d.fecha_emision, d.id_especialidad_requerida,
            esp.nombre AS especialidad_requerida_nombre,
            e.nombre_completo AS estudiante_nombre
     FROM ordenes_derivacion d
     LEFT JOIN especialidades esp ON d.id_especialidad_requerida = esp.id_especialidad
     JOIN estudiantes e ON d.id_estudiante = e.id_estudiante
     WHERE d.id_derivacion = $1
       AND d.id_estudiante = $2
     FOR UPDATE OF d`,
    [id_derivacion, id_estudiante]
  );
  return result.rows[0] ?? null;
};

export const marcarDerivacionUtilizada = async (client, id_derivacion) => {
  await client.query(
    `UPDATE ordenes_derivacion SET estado = 'UTILIZADA' WHERE id_derivacion = $1`,
    [id_derivacion]
  );
};

export const obtenerFichasPorEstudiante = async (id_estudiante) => {
  const result = await query(
    `SELECT f.id_ficha, f.tipo_ficha, f.estado, f.fecha_reserva,
            h.id_horario, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio,
            m.nombre_completo AS medico_nombre, m.es_especialista,
            COALESCE(esp.nombre, 'Medicina General') AS especialidad_nombre
     FROM fichas_reservadas f
     JOIN horarios_atencion h ON f.id_horario = h.id_horario
     JOIN medicos m ON h.id_medico = m.id_medico
     LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
     WHERE f.id_estudiante = $1
     ORDER BY h.fecha DESC, h.hora_inicio DESC`,
    [id_estudiante]
  );
  return result.rows;
};
