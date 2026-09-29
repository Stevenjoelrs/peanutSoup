/**
 * NÚCLEO FRONTEND — cliente HTTP
 * -----------------------------------------------------------------------------
 * Un único punto de salida hacia la API. Añade el Bearer token, normaliza el
 * sobre { success, message, data, timestamp } y traduce los errores a mensajes
 * en español. Ningún módulo hace fetch() por su cuenta.
 */
import { sesion } from './sesion.js';

/** Error de API con el status HTTP para que cada página pueda reaccionar. */
export class ErrorApi extends Error {
  constructor(mensaje, status, detalles = null) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.detalles = detalles;
  }
}

/**
 * @param {string} url        ruta de la API (ej. '/api/afiliaciones/vigencia')
 * @param {object} [opciones] method, body, headers
 * @returns {Promise<any>}    contenido de `data` del sobre de éxito
 */
export const api = async (url, { method = 'GET', body, headers = {}, ...resto } = {}) => {
  const cabeceras = { Accept: 'application/json', ...headers };
  const token = sesion.token;
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (body !== undefined) cabeceras['Content-Type'] = 'application/json';

  const respuesta = await fetch(url, {
    method,
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...resto
  });

  if (respuesta.status === 204) return null;

  const tipo = respuesta.headers.get('content-type') ?? '';
  const carga = tipo.includes('application/json') ? await respuesta.json() : await respuesta.text();

  if (!respuesta.ok) {
    const mensaje =
      (carga && typeof carga === 'object' && carga.message) ||
      (typeof carga === 'string' && carga) ||
      `Error ${respuesta.status} al llamar a ${url}`;
    throw new ErrorApi(mensaje, respuesta.status, carga?.error ?? null);
  }

  return carga && typeof carga === 'object' && 'data' in carga ? carga.data : carga;
};

/** Igual que api() pero devolviendo el sobre completo (message incluido). */
export const apiCompleta = async (url, opciones) => {
  const cabeceras = { Accept: 'application/json', ...(opciones?.headers ?? {}) };
  const token = sesion.token;
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (opciones?.body !== undefined) cabeceras['Content-Type'] = 'application/json';

  const respuesta = await fetch(url, {
    method: opciones?.method ?? 'GET',
    headers: cabeceras,
    body: opciones?.body === undefined ? undefined : JSON.stringify(opciones.body)
  });
  const carga = await respuesta.json();
  if (!respuesta.ok) {
    throw new ErrorApi(carga.message ?? `Error ${respuesta.status}`, respuesta.status, carga.error ?? null);
  }
  return carga;
};

/** Construye un query string omitiendo valores vacíos. */
export const conParams = (url, params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') query.append(clave, valor);
  });
  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
};
