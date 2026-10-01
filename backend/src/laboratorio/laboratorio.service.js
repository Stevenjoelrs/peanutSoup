import * as laboratorioRepo from './laboratorio.repository.js';

export const obtenerOrdenesLaboratorioPorEstudiante = async (estudianteId) => {
  return await laboratorioRepo.obtenerOrdenesPorEstudiante(estudianteId);
};

export const obtenerOrdenLaboratorioPorId = async (ordenId, estudianteId) => {
  const orden = await laboratorioRepo.obtenerOrdenPorId(ordenId);
  
  if (!orden) {
    return null;
  }

  // Verificar que la orden pertenezca al estudiante autenticado
  const idEstudianteOrden = orden.estudiante_id || orden.id_estudiante || orden.paciente_id;
  if (idEstudianteOrden && String(idEstudianteOrden) !== String(estudianteId)) {
    return null;
  }

  return orden;
};