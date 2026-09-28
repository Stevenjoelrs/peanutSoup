/**
 * SSU - UMSS | Errores de dominio (capa de negocio)
 * -----------------------------------------------------------------------------
 * Los servicios lanzan estas excepciones y el middleware global las traduce al
 * contrato de respuesta `{ success: false, message, error, timestamp }`.
 *
 * Agregar un caso de negocio nuevo NO obliga a tocar errorHandler.js: basta con
 * lanzar `badRequest('...')` desde el servicio. Los servicios nunca importan
 * Express; no conocen `req` ni `res`.
 */
export class DomainError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message, details = null) => new DomainError(message, 400, details);
export const unauthorized = (message, details = null) => new DomainError(message, 401, details);
export const forbidden = (message, details = null) => new DomainError(message, 403, details);
export const notFound = (message, details = null) => new DomainError(message, 404, details);
export const conflict = (message, details = null) => new DomainError(message, 409, details);
