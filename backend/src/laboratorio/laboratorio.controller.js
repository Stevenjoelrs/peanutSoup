import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './laboratorio.service.js';

export const listarMisOrdenes = manejar(async (req, res) => {
  const { mensaje, data } = await servicio.obtenerMisOrdenes(req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

export const obtenerOrden = manejar(async (req, res) => {
  const { id } = req.params;
  const { mensaje, data } = await servicio.obtenerOrdenConResultado(id, req.user.id_estudiante);
  return successResponse(res, mensaje, data);
});

export const descargarResultado = manejar(async (req, res) => {
  const { id } = req.params;
  const resultado = await servicio.validarDescargaResultado(id, req.user.id_estudiante);
  // Redirigir a la URL del archivo (Supabase Storage u otro proveedor)
  // El frontend puede abrir esta URL en nueva pestaña o descargar directamente
  return successResponse(res, 'Resultado disponible', {
    archivo_url: resultado.archivo_url,
    nombre_archivo: resultado.nombre_archivo
  });
});