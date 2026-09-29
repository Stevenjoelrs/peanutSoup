const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const esUUID = (valor) => typeof valor === 'string' && UUID_REGEX.test(valor);

export const esFechaValida = (valor) => {
  if (typeof valor !== 'string' || !DATE_REGEX.test(valor)) return false;
  return !Number.isNaN(new Date(valor).getTime());
};

export const esTextoNoVacio = (valor) => typeof valor === 'string' && valor.trim().length > 0;
