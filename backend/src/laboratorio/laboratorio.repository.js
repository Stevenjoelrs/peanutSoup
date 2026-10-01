import { pool } from '../shared/config/db.js';

export const obtenerOrdenesPorEstudiante = async (id_estudiante) => {
  const { rows } = await pool.query(
        `SELECT o.id_orden_lab AS id_orden,
          o.id_estudiante,
          o.id_medico,
          m.nombre_completo AS medico_solicitante,
          o.tipo_laboratorio AS analisis_solicitados,
          o.fecha_orden,
          o.estado
         FROM public.ordenes_laboratorio AS o
         LEFT JOIN public.medicos AS m ON m.id_medico = o.id_medico
         WHERE o.id_estudiante = $1
         ORDER BY o.fecha_orden DESC`,
    [id_estudiante]
  );
  return rows;
};

export const obtenerOrdenPorIdYEstudiante = async (id_orden, id_estudiante) => {
  const { rows } = await pool.query(
        `SELECT o.id_orden_lab AS id,
          o.id_estudiante,
          o.id_medico,
          m.nombre_completo AS medico_solicitante,
          o.tipo_laboratorio AS analisis_solicitados,
          o.fecha_orden,
          o.estado,
          o.url_informe_resultado AS enlace_informe
         FROM public.ordenes_laboratorio AS o
         LEFT JOIN public.medicos AS m ON m.id_medico = o.id_medico
         WHERE o.id_orden_lab = $1 AND o.id_estudiante = $2`,
    [id_orden, id_estudiante]
  );
  return rows[0] || null;
};