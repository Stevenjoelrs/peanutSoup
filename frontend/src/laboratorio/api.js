/**
 * MÓDULO laboratorio — capa de datos (US-13)
 * -----------------------------------------------------------------------------
 * Contrato preservado:
 *   GET  /api/laboratorio/mis-ordenes           -> 200 (lista de órdenes del estudiante)
 *   GET  /api/laboratorio/ordenes/:id           -> 200 (detalle de orden + resultado si existe)
 *   GET  /api/laboratorio/ordenes/:id/resultado -> 200 (URL del archivo, solo si FINALIZADA)
 */
import { api, apiCompleta } from '../shared/http.js';

export const misOrdenes = () => api('/api/laboratorio/mis-ordenes');

export const obtenerOrden = (id) => api(`/api/laboratorio/ordenes/${id}`);

export const urlResultado = (id) => `/api/laboratorio/ordenes/${id}/resultado`;

// Re-export para uso en pagina.js (necesita el sobre completo con archivo_url)
export { apiCompleta };