import { esFechaCalendarioValida } from './fechas.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const esUUID = (valor) => typeof valor === 'string' && UUID_REGEX.test(valor);

/**
 * Fecha calendario válida: formato YYYY-MM-DD con día real (bisiesto
 * incluido). `new Date('2024-02-30')` lo redondea a marzo en vez de fallar,
 * así que no se usa para validar calendario (ver fechas.js).
 */
export const esFechaValida = (valor) => esFechaCalendarioValida(valor);

export const esTextoNoVacio = (valor) => typeof valor === 'string' && valor.trim().length > 0;
