/**
 * SSU - UMSS | Formateador estándar de respuestas exitosas de la API
 * -----------------------------------------------------------------------------
 * Un solo sobre para todo el backend. El frontend desenvuelve `data` y nunca
 * tiene que adivinar la forma de la respuesta.
 */
export const successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * SSU - UMSS | Formateador estándar de respuestas de error de la API
 * -----------------------------------------------------------------------------
 * Contrato inverso: `{ success: false, message, error, timestamp }`.
 * `error` lleva los detalles y se puebla solo en desarrollo.
 */
export const errorResponse = (res, message, statusCode = 400, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: details,
    timestamp: new Date().toISOString()
  });
};
