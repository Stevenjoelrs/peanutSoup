/**
 * NÚCLEO FRONTEND — formato de datos
 * -----------------------------------------------------------------------------
 * Todo el módulo usa estas funciones para que las fechas se vean iguales en
 * las seis pantallas (el diseño está en español de Bolivia).
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Convierte 'YYYY-MM-DD' o un timestamp ISO en Date sin desfase de zona. */
export const aFecha = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const texto = String(valor);
  const fecha = new Date(texto.length <= 10 ? `${texto}T12:00:00` : texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

/** '2025-03-25' -> '25 de marzo de 2025' */
export const fechaLarga = (valor) => {
  const fecha = aFecha(valor);
  if (!fecha) return '—';
  return `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
};

/** '2025-03-25' -> '25/03/2025' */
export const fechaCorta = (valor) => {
  const fecha = aFecha(valor);
  if (!fecha) return '—';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
};

/** '2025-03-25' -> '25 mar' */
export const fechaMini = (valor) => {
  const fecha = aFecha(valor);
  if (!fecha) return '—';
  return `${fecha.getDate()} ${MESES[fecha.getMonth()].slice(0, 3)}`;
};

/** 'martes' */
export const diaSemana = (valor) => {
  const fecha = aFecha(valor);
  return fecha ? DIAS[fecha.getDay()] : '—';
};

/** 25 de marzo de 2025 -> martes */
export const diaCorto = (valor) => {
  const fecha = aFecha(valor);
  return fecha ? `${DIAS[fecha.getDay()].slice(0, 3)} ${fecha.getDate()}` : '—';
};

/** '2025-03-25' -> '2025-03-25' (input type=date) */
export const paraInputDate = (valor) => {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mm}-${dd}`;
};

/**
 * Normaliza a 'YYYY-MM-DD' sin pasar por la zona horaria: los `date` de
 * PostgreSQL llegan como 'YYYY-MM-DD' o como 'YYYY-MM-DDTHH:mm:ss.sssZ' y
 * ambos deben compararse igual contra los `data-fecha` de los listados.
 */
export const soloFechaIso = (valor) => {
  if (!valor) return null;
  const texto = String(valor);
  const corte = texto.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(corte) ? corte : paraInputDate(texto) || null;
};

/** '14:30:00' -> '14:30' (o '2:30 pm' si se pide formato 12h) */
export const hora = (valor, doceHoras = false) => {
  if (!valor) return '—';
  const partes = String(valor).split(':');
  let h = parseInt(partes[0], 10);
  const m = partes[1] ?? '00';
  if (Number.isNaN(h)) return '—';
  if (!doceHoras) return `${String(h).padStart(2, '0')}:${m}`;
  const sufijo = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${m} ${sufijo}`;
};

/** '14:30:00' -> '2:30 PM' (formato corto de 12 horas para los diseños) */
export const horaCorta = (valor) => hora(valor, true);

/** '14:30' + 40 -> '15:10' (para los bloques de consulta del diseño) */
export const sumarMinutos = (valor, minutos) => {
  const partes = String(valor ?? '00:00').split(':');
  const base = new Date(2000, 0, 1, parseInt(partes[0], 10) || 0, parseInt(partes[1], 10) || 0);
  base.setMinutes(base.getMinutes() + minutos);
  return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
};

/** Iniciales para el avatar del encabezado. */
export const iniciales = (nombre = '') =>
  String(nombre)
    .replace(/^(Univ\.?|Lic\.?|Dr[a]?\.?|Sr[a]?\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'SSU';
