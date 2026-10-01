import * as laboratorioRepo from './laboratorio.repository.js';

export const obtenerOrdenesLaboratorioPorEstudiante = async (estudianteId) => {
  return await laboratorioRepo.obtenerOrdenesPorEstudiante(estudianteId);
};

export const obtenerOrdenLaboratorioPorId = async (ordenId, estudianteId) => {
  return await laboratorioRepo.obtenerOrdenPorIdYEstudiante(ordenId, estudianteId);
};

export const informeDisponible = async (enlaceInforme) => {
  let url;
  try {
    url = new URL(enlaceInforme);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const opciones = {
    method: 'HEAD',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000)
  };

  try {
    let respuesta = await fetch(url, opciones);

    if (respuesta.status === 405 || respuesta.status === 501) {
      respuesta = await fetch(url, {
        ...opciones,
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
      await respuesta.body?.cancel();
    }

    return respuesta.ok;
  } catch {
    return false;
  }
};