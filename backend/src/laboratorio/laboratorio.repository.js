import { pool } from '../shared/config/db.js';

export const obtenerOrdenPorIdYEstudiante = async (id_orden, id_estudiante) => {
  const query = `
    SELECT 
      id_orden,
      id_estudiante,
      fecha_orden,
      estado,
      observaciones,
      resultado_pdf_url,
      analisis_solicitados
    FROM ordenes_laboratorio
    WHERE id_orden = $1 AND id_estudiante = $2;
  `;
  const { rows } = await pool.query(query, [id_orden, id_estudiante]);
  return rows[0] || null;
};