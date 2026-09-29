/**
 * SSU - UMSS | Validadores de entrada
 * -----------------------------------------------------------------------------
 * Validación centralizada de formatos de datos que llegan en el body, params o
 * query. Las rutas y controladores importan estos helpers para rechazar valores
 * mal formados antes de que lleguen a la base de datos como un error 22P02
 * ("invalid input syntax").
 *
 * No se usa una librería externa (Zod, Joi) para mantener zero-dependency en
 * este paquete; si el equipo decide migrar a una, estos helpers se reemplazan.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Retorna true si el valor es un UUID v1–v7 válido. */
export const esUUID = (valor) => typeof valor === 'string' && UUID_REGEX.test(valor);

/** Retorna true si el valor tiene formato YYYY-MM-DD y es una fecha real. */
export const esFechaValida = (valor) => {
  if (typeof valor !== 'string' || !DATE_REGEX.test(valor)) return false;
  return !Number.isNaN(new Date(valor).getTime());
};

/** Retorna true si el valor es un string no vacío después de trim. */
export const esTextoNoVacio = (valor) => typeof valor === 'string' && valor.trim().length > 0;
