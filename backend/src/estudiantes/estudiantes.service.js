import { notFound, badRequest } from '../shared/http/errors.js';
import * as repo from './estudiantes.repository.js';

export const listarEstudiantes = async () => {
  return repo.obtenerTodos();
};

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
