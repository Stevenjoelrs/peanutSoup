/** MÓDULO renovación — acceso a la API de afiliaciones (US-12). */
import { api } from '../shared/http.js';

export const consultarVigencia = () => api('/api/afiliaciones/vigencia');

export const renovarAfiliacion = (datos) =>
  api('/api/afiliaciones/renovar', { method: 'POST', body: datos });