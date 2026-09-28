import { errorResponse } from './response.js';

/**
 * SSU - UMSS | Envoltura de controladores Express
 * -----------------------------------------------------------------------------
 * Traduce DomainError (capa de negocio) al contrato de error vigente y deja
 * pasar el resto de excepciones al middleware global. Evita repetir el
 * try/catch en cada handler y hace explícito el status code de cada caso.
 *
 *   router.get('/algo', manejar(async (req, res) => { ... }));
 */
export const manejar = (controlador) => async (req, res, next) => {
  try {
    return await controlador(req, res, next);
  } catch (error) {
    if (error?.name === 'DomainError') {
      return errorResponse(res, error.message, error.statusCode, error.details);
    }
    return next(error);
  }
};
