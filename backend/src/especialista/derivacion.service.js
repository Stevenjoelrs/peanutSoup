import { badRequest } from '../shared/http/errors.js';
import * as repo from './derivacion.repository.js';

export const obtenerDerivacionesActivas = async (id_estudiante) => {
  const derivaciones = await repo.obtenerActivasPorEstudiante(id_estudiante);
  return {
    mensaje: `Se encontraron ${derivaciones.length} órdenes de derivación activas.`,
    data: derivaciones
  };
};

export const obtenerHistorialDerivaciones = async (id_estudiante) => {
  const derivaciones = await repo.obtenerHistorialPorEstudiante(id_estudiante);
  return {
    mensaje: 'Historial completo de derivaciones obtenido.',
    data: derivaciones
  };
};

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
