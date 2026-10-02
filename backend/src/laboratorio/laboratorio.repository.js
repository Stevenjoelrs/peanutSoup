import { query, conTransaccion } from '../shared/config/db.js';

export { conTransaccion };

/**
 * Lista todas las órdenes de laboratorio del estudiante con datos enriquecidos.
 * Incluye: médico emisor, especialidad/tipo de examen, estado, fecha.
 */
export const listarPorEstudiante = async (id_estudiante) => {
  const result = await query(
    `SELECT ol.id_orden_laboratorio, ol.id_estudiante, ol.id_medico_emisor,
            ol.id_especialidad, ol.estado, ol.fecha_emision, ol.observaciones_medico,
            esp.nombre AS especialidad_nombre,
            esp.descripcion AS especialidad_descripcion,
            m.nombre_completo AS medico_emisor_nombre
     FROM ordenes_laboratorio ol
     LEFT JOIN especialidades esp ON ol.id_especialidad = esp.id_especialidad
     JOIN medicos m ON ol.id_medico_emisor = m.id_medico
     WHERE ol.id_estudiante = $1
     ORDER BY ol.fecha_emision DESC`,
    [id_estudiante]
  );
  return result.rows;
};

/**
 * Obtiene el detalle de una orden de laboratorio incluyendo su resultado (si existe).
 * Valida que la orden pertenezca al estudiante (seguridad a nivel de datos).
 */
export const obtenerDetallePorEstudiante = async (id_orden_laboratorio, id_estudiante) => {
  const result = await query(
    `SELECT ol.id_orden_laboratorio, ol.id_estudiante, ol.id_medico_emisor,
            ol.id_especialidad, ol.estado, ol.fecha_emision, ol.observaciones_medico,
            esp.nombre AS especialidad_nombre,
            esp.descripcion AS especialidad_descripcion,
            m.nombre_completo AS medico_emisor_nombre,
            rl.id_resultado, rl.archivo_url, rl.nombre_archivo, rl.fecha_subida,
            m_subido.nombre_completo AS subido_por_nombre
     FROM ordenes_laboratorio ol
     LEFT JOIN especialidades esp ON ol.id_especialidad = esp.id_especialidad
     JOIN medicos m ON ol.id_medico_emisor = m.id_medico
     LEFT JOIN resultados_laboratorio rl ON ol.id_orden_laboratorio = rl.id_orden_laboratorio
     LEFT JOIN medicos m_subido ON rl.subido_por = m_subido.id_medico
     WHERE ol.id_orden_laboratorio = $1
       AND ol.id_estudiante = $2`,
    [id_orden_laboratorio, id_estudiante]
  );
  return result.rows[0] || null;
};

/**
 * Verifica si una orden existe y pertenece al estudiante (para autorización).
 * Devuelve la orden básica o null.
 */
export const verificarPertenencia = async (id_orden_laboratorio, id_estudiante) => {
  const result = await query(
    `SELECT id_orden_laboratorio, id_estudiante, estado
     FROM ordenes_laboratorio
     WHERE id_orden_laboratorio = $1 AND id_estudiante = $2`,
    [id_orden_laboratorio, id_estudiante]
  );
  return result.rows[0] || null;
};