import { badRequest } from '../shared/http/errors.js';
import * as repo from './derivacion.repository.js';

/**
 * CAPA DE NEGOCIO — módulo de especialista / órdenes de derivación
 * -----------------------------------------------------------------------------
 * Aplica reglas de validación y negocio sobre las derivaciones médicas.
 * No conoce Express ni HTTP: lanza DomainError y devuelve objetos limpios.
 */

/**
 * Consultar órdenes de derivación activas de un estudiante.
 * @param {string} id_estudiante
 * @returns {Promise<{ mensaje: string, data: Array<object> }>}
 */
export const obtenerDerivacionesActivas = async (id_estudiante) => {
  const derivaciones = await repo.obtenerActivasPorEstudiante(id_estudiante);
  return {
    mensaje: `Se encontraron ${derivaciones.length} órdenes de derivación activas.`,
    data: derivaciones
  };
};

/**
 * Consultar el historial completo de derivaciones de un estudiante.
 * @param {string} id_estudiante
 * @returns {Promise<{ mensaje: string, data: Array<object> }>}
 */
export const obtenerHistorialDerivaciones = async (id_estudiante) => {
  const derivaciones = await repo.obtenerHistorialPorEstudiante(id_estudiante);
  return {
    mensaje: 'Historial completo de derivaciones obtenido.',
    data: derivaciones
  };
};

/**
 * Crear una nueva orden de derivación.
 * @param {string} id_estudiante
 * @param {object} param1
 * @returns {Promise<{ mensaje: string, data: object }>}
 */
export const emitirDerivacion = async (id_estudiante, { id_medico_emisor, id_especialidad_requerida }) => {
  if (!id_medico_emisor || !id_especialidad_requerida) {
    throw badRequest('Los campos id_medico_emisor e id_especialidad_requerida son requeridos.');
  }

  const nuevaDerivacion = await repo.insertarDerivacion({
    id_estudiante,
    id_medico_emisor,
    id_especialidad_requerida
  });

  return {
    mensaje: 'Orden de derivación emitida con éxito.',
    data: nuevaDerivacion
  };
};
