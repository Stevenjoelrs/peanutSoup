import { errorResponse } from '../http/response.js';

/**
 * SSU - UMSS | ¿Estamos en desarrollo?
 * -----------------------------------------------------------------------------
 * Solo en desarrollo se filtran detalles internos al cliente. En producción el
 * sobre de error sale limpio para no revelar nombres de tabla ni esquema.
 */
const enDesarrollo = () => process.env.NODE_ENV === 'development';

/**
 * Detalles de PostgreSQL (constraint, valores) que solo deben verse en local.
 */
const detalleSeguro = (err) =>
  enDesarrollo() ? { detail: err.detail, constraint: err.constraint } : undefined;

/**
 * SSU - UMSS | Middleware global de errores
 * -----------------------------------------------------------------------------
 * Traduce fallos de infraestructura al contrato de error. Es el unico lugar
 * donde se conoce el `code` de PostgreSQL, de modo que los repositorios no
 * tengan que traducir códigos SQL a status HTTP.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[UNHANDLED ERROR]:', err);

  // JSON mal formado en el cuerpo de la petición (body-parser)
  if (err.type === 'entity.parse.failed') {
    return errorResponse(res, 'El cuerpo de la petición no es un JSON válido.', 400);
  }

  // Violación de unicidad
  if (err.code === '23505') {
    return errorResponse(
      res,
      'Conflicto de unicidad en la base de datos (registro duplicado).',
      409,
      detalleSeguro(err)
    );
  }

  // Violación de clave foránea
  if (err.code === '23503') {
    return errorResponse(
      res,
      'Violación de integridad referencial. Una clave foránea asociada no existe.',
      400,
      detalleSeguro(err)
    );
  }

  // Formato inválido: UUID o fecha mal estructurada
  if (err.code === '22P02') {
    return errorResponse(
      res,
      'Formato de dato inválido (por ejemplo, UUID o fecha mal estructurada).',
      400,
      enDesarrollo() ? { detail: err.message } : undefined
    );
  }

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Error interno del servidor.';

  return errorResponse(res, message, statusCode, enDesarrollo() ? err.stack : undefined);
};
