import { api } from '../shared/http.js';

export const obtenerOrdenesApi = () => api('/api/laboratorio/ordenes');

export const descargarInformeApi = (idOrden) =>
    api(`/api/laboratorio/ordenes/${encodeURIComponent(idOrden)}/descargar-informe`);