import { query } from '../shared/config/db.js';
import { successResponse, errorResponse } from '../shared/http/response.js';

/**
 * Listar todos los estudiantes con su estado de afiliación más reciente
 */
export const listarEstudiantes = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT e.id_estudiante, e.sis, e.cedula_identidad, e.nombre_completo, e.facultad, e.carrera, e.created_at,
             e.fecha_nacimiento, e.grupo_sanguineo, e.telefono, e.direccion,
             e.emergencia_nombre, e.emergencia_parentesco, e.emergencia_telefono,
             a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado AS estado_afiliacion,
             CASE
               WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
               WHEN a.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
               ELSE 'ACTIVA'
             END AS estado_afiliacion_efectivo,
             (a.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer
      FROM estudiantes e
      LEFT JOIN LATERAL (
        SELECT id_afiliacion, periodo_semestral, fecha_inicio, fecha_vencimiento, estado
        FROM afiliaciones
        WHERE id_estudiante = e.id_estudiante
        ORDER BY fecha_vencimiento DESC
        LIMIT 1
      ) a ON TRUE
      ORDER BY e.nombre_completo ASC;
    `);

    return successResponse(res, 'Lista de estudiantes obtenida.', result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Buscar estudiante por SIS o CI
 */
export const buscarEstudiante = async (req, res, next) => {
  try {
    const { termino } = req.params;

    const result = await query(
      `SELECT e.id_estudiante, e.sis, e.cedula_identidad, e.nombre_completo, e.facultad, e.carrera,
              e.fecha_nacimiento, e.grupo_sanguineo, e.telefono, e.direccion,
              e.emergencia_nombre, e.emergencia_parentesco, e.emergencia_telefono,
              a.id_afiliacion, a.periodo_semestral, a.fecha_inicio, a.fecha_vencimiento, a.estado AS estado_afiliacion,
              CASE
                WHEN a.estado = 'INACTIVA' THEN 'INACTIVA'
                WHEN a.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDA'
                ELSE 'ACTIVA'
              END AS estado_afiliacion_efectivo,
              (a.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer
       FROM estudiantes e
       LEFT JOIN LATERAL (
         SELECT id_afiliacion, periodo_semestral, fecha_inicio, fecha_vencimiento, estado
         FROM afiliaciones
         WHERE id_estudiante = e.id_estudiante
         ORDER BY fecha_vencimiento DESC
         LIMIT 1
       ) a ON TRUE
       WHERE e.sis = $1 OR e.cedula_identidad = $1 OR e.id_estudiante::text = $1
       LIMIT 1`,
      [termino]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Estudiante no encontrado.', 404);
    }

    return successResponse(res, 'Estudiante encontrado.', result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Registrar nuevo estudiante
 */
export const crearEstudiante = async (req, res, next) => {
  try {
    const { 
      sis, cedula_identidad, nombre_completo, facultad, carrera,
      fecha_nacimiento, grupo_sanguineo, telefono, direccion,
      emergencia_nombre, emergencia_parentesco, emergencia_telefono
    } = req.body;

    if (!sis || !cedula_identidad || !nombre_completo || !facultad || !carrera) {
      return errorResponse(res, 'Los campos principales del estudiante son obligatorios.', 400);
    }

    const result = await query(
      `INSERT INTO estudiantes (
         sis, cedula_identidad, nombre_completo, facultad, carrera,
         fecha_nacimiento, grupo_sanguineo, telefono, direccion,
         emergencia_nombre, emergencia_parentesco, emergencia_telefono
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id_estudiante, sis, cedula_identidad, nombre_completo, facultad, carrera, created_at`,
      [
        sis, cedula_identidad, nombre_completo, facultad, carrera,
        fecha_nacimiento, grupo_sanguineo, telefono, direccion,
        emergencia_nombre, emergencia_parentesco, emergencia_telefono
      ]
    );

    return successResponse(res, 'Estudiante registrado correctamente.', result.rows[0], 201);
  } catch (error) {
    next(error);
  }
};
