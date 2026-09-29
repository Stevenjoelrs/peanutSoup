import { notFound, badRequest } from '../shared/http/errors.js';
import * as repo from './estudiantes.repository.js';

/**
 * CAPA DE NEGOCIO — módulo de estudiantes
 * -----------------------------------------------------------------------------
 * Aplica reglas de validación y negocio sobre el padrón de estudiantes.
 * No conoce Express ni HTTP: lanza DomainError y devuelve estructuras limpias.
 */

/**
 * Obtener todos los estudiantes del padrón con su estado de afiliación más reciente.
 * @returns {Promise<Array<object>>}
 */
export const listarEstudiantes = async () => {
  return repo.obtenerTodos();
};

/**
 * Buscar un estudiante por SIS, CI o UUID.
 * @param {string} termino
 * @returns {Promise<object>}
 */
export const buscarEstudiante = async (termino) => {
  if (!termino || typeof termino !== 'string' || !termino.trim()) {
    throw badRequest('El término de búsqueda es obligatorio.');
  }

  const estudiante = await repo.buscarPorTermino(termino.trim());

  if (!estudiante) {
    throw notFound('Estudiante no encontrado.');
  }

  return estudiante;
};

/**
 * Registrar un nuevo estudiante en el padrón.
 * @param {object} param0
 * @returns {Promise<object>}
 */
export const registrarEstudiante = async ({ sis, cedula_identidad, nombre_completo, facultad, carrera }) => {
  const campos = { sis, cedula_identidad, nombre_completo, facultad, carrera };

  for (const [campo, valor] of Object.entries(campos)) {
    if (!valor || typeof valor !== 'string' || !valor.trim()) {
      throw badRequest('Los campos principales del estudiante son obligatorios.', { campo_faltante: campo });
    }
  }

  return repo.insertarEstudiante({
    sis: sis.trim(),
    cedula_identidad: cedula_identidad.trim(),
    nombre_completo: nombre_completo.trim(),
    facultad: facultad.trim(),
    carrera: carrera.trim()
  });
};
