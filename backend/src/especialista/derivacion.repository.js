import { query, conTransaccion } from '../shared/config/db.js';

export { conTransaccion };

export const obtenerActivasPorEstudiante = async (id_estudiante) => {
  const result = await query(
    `SELECT d.id_derivacion, d.id_estudiante, d.id_medico_emisor, d.estado, d.fecha_emision,
            d.id_especialidad_requerida,
            esp.nombre AS especialidad_requerida,
            esp.descripcion AS descripcion_especialidad,
            m.nombre_completo AS medico_emisor_nombre
     FROM ordenes_derivacion d
     LEFT JOIN especialidades esp ON d.id_especialidad_requerida = esp.id_especialidad
     JOIN medicos m ON d.id_medico_emisor = m.id_medico
     WHERE d.id_estudiante = $1
       AND d.estado = 'ACTIVA'
     ORDER BY d.fecha_emision DESC`,
    [id_estudiante]
  );
  return result.rows;
};

export const obtenerHistorialPorEstudiante = async (id_estudiante) => {
  const result = await query(
    `SELECT d.id_derivacion, d.id_estudiante, d.estado, d.fecha_emision,
            esp.id_especialidad, esp.nombre AS especialidad_requerida,
            m.nombre_completo AS medico_emisor_nombre
     FROM ordenes_derivacion d
     LEFT JOIN especialidades esp ON d.id_especialidad_requerida = esp.id_especialidad
     JOIN medicos m ON d.id_medico_emisor = m.id_medico
     WHERE d.id_estudiante = $1
     ORDER BY d.fecha_emision DESC`,
    [id_estudiante]
  );
  return result.rows;
};

export const insertarDerivacion = async ({ id_estudiante, id_medico_emisor, id_especialidad_requerida }) => {
  const result = await query(
    `INSERT INTO ordenes_derivacion (id_estudiante, id_medico_emisor, id_especialidad_requerida, estado)
     VALUES ($1, $2, $3, 'ACTIVA')
     RETURNING id_derivacion, id_estudiante, id_medico_emisor, id_especialidad_requerida, estado, fecha_emision`,
    [id_estudiante, id_medico_emisor, id_especialidad_requerida]
  );
  return result.rows[0];
};

export const insertarDerivacionConCliente = async (client, { id_estudiante, id_medico_emisor, id_especialidad_requerida }) => {
  const result = await client.query(
    `INSERT INTO ordenes_derivacion (id_estudiante, id_medico_emisor, id_especialidad_requerida, estado)
     VALUES ($1, $2, $3, 'ACTIVA')
     RETURNING id_derivacion, id_estudiante, id_medico_emisor, id_especialidad_requerida, estado, fecha_emision`,
    [id_estudiante, id_medico_emisor, id_especialidad_requerida]
  );
  return result.rows[0];
};
