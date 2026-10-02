import { query, conTransaccion } from '../shared/config/db.js';
import { notFound, forbidden } from '../shared/http/errors.js';
import * as repo from './laboratorio.repository.js';

export { conTransaccion };

/**
 * Obtiene la lista de órdenes de laboratorio del estudiante autenticado.
 */
export const obtenerMisOrdenes = async (id_estudiante) => {
  const ordenes = await repo.listarPorEstudiante(id_estudiante);
  return {
    mensaje: ordenes.length ? 'Órdenes de laboratorio obtenidas' : 'No tienes órdenes de laboratorio',
    data: ordenes
  };
};

/**
 * Obtiene el detalle completo de una orden (incluye resultado si existe).
 * Valida ownership y lanza DomainError si no pertenece al estudiante.
 */
export const obtenerOrdenConResultado = async (id_orden_laboratorio, id_estudiante) => {
  const orden = await repo.obtenerDetallePorEstudiante(id_orden_laboratorio, id_estudiante);
  if (!orden) {
    throw notFound('Orden de laboratorio no encontrada');
  }
  return {
    mensaje: 'Detalle de orden obtenido',
    data: orden
  };
};

/**
 * Valida que la orden esté FINALIZADA y tenga resultado para permitir descarga.
 * Lanza DomainError.forbidden si no se cumple.
 */
export const validarDescargaResultado = async (id_orden_laboratorio, id_estudiante) => {
  const orden = await repo.verificarPertenencia(id_orden_laboratorio, id_estudiante);
  if (!orden) {
    throw notFound('Orden de laboratorio no encontrada');
  }
  if (orden.estado !== 'FINALIZADA') {
    throw forbidden('El resultado solo está disponible cuando la orden está FINALIZADA');
  }
  // Verificar que existe el resultado (archivo)
  const resultado = await query(
    `SELECT id_resultado, archivo_url, nombre_archivo
     FROM resultados_laboratorio
     WHERE id_orden_laboratorio = $1`,
    [id_orden_laboratorio]
  );
  if (!resultado.rows.length) {
    throw notFound('La orden está FINALIZADA pero no tiene resultado cargado');
  }
  return resultado.rows[0];
};