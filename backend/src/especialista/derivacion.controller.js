import { query } from '../shared/config/db.js';
import { successResponse, errorResponse } from '../shared/http/response.js';

/**
 * US-08 — Consultar órdenes de derivación activas
 * Filtra ÚNICAMENTE las derivaciones del id_estudiante autenticado (req.user).
 */
export const listarDerivacionesActivas = async (req, res, next) => {
  try {
    // id_estudiante siempre del JWT — garantiza que no pueda ver derivaciones ajenas
    const id_estudiante = req.user.id_estudiante;

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

    return successResponse(
      res,
      `Se encontraron ${result.rows.length} órdenes de derivación activas.`,
      result.rows
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Listar todas las derivaciones del estudiante autenticado (historial completo)
 */
export const listarTodasDerivacionesEstudiante = async (req, res, next) => {
  try {
    const id_estudiante = req.user.id_estudiante;

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

    return successResponse(res, 'Historial completo de derivaciones obtenido.', result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Crear nueva orden de derivación (Facilitador para pruebas)
 * Solo el médico emisor debería poder hacer esto; aquí se mantiene como helper de prueba.
 */
export const crearDerivacion = async (req, res, next) => {
  try {
    const { id_medico_emisor, id_especialidad_requerida } = req.body;
    // id_estudiante siempre del JWT autenticado
    const id_estudiante = req.user.id_estudiante;

    if (!id_medico_emisor || !id_especialidad_requerida) {
      return errorResponse(
        res,
        'Los campos id_medico_emisor e id_especialidad_requerida son requeridos.',
        400
      );
    }

    const insertResult = await query(
      `INSERT INTO ordenes_derivacion (id_estudiante, id_medico_emisor, id_especialidad_requerida, estado)
       VALUES ($1, $2, $3, 'ACTIVA')
       RETURNING id_derivacion, id_estudiante, id_medico_emisor, id_especialidad_requerida, estado, fecha_emision`,
      [id_estudiante, id_medico_emisor, id_especialidad_requerida]
    );

    return successResponse(res, 'Orden de derivación emitida con éxito.', insertResult.rows[0], 201);
  } catch (error) {
    next(error);
  }
};
