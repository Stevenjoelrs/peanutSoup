/**
 * SSU - UMSS | Fechas calendario puras (Fase 3)
 * -----------------------------------------------------------------------------
 * Regla del proyecto:
 *
 *   DATE      -> calendario ('YYYY-MM-DD', America/La_Paz). Nunca `new Date`.
 *   TIMESTAMPTZ -> instante (`new Date`, `toISOString`, CURRENT_TIMESTAMP).
 *
 * No mezclar ambos conceptos. `new Date('2024-02-30')` no falla: lo redondea
 * a marzo, así que no sirve para validar ni para comparar fechas calendario.
 * Aquí todo se resuelve con cadenas ISO y aritmética de días UTC (sin DST).
 */

const FECHA_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const ZONA_LA_PAZ = 'America/La_Paz';

export const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

export const diasEnMes = (anio, mes) => {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  if ([4, 6, 9, 11].includes(mes)) return 30;
  return 31;
};

/**
 * '2024-02-29' -> true (bisiesto real). '2023-02-29', '2024-02-30',
 * '2025-13-01' -> false. Solo acepta cadenas con formato YYYY-MM-DD.
 */
export const esFechaCalendarioValida = (valor) => {
  if (typeof valor !== 'string') return false;
  const partes = FECHA_REGEX.exec(valor);
  if (!partes) return false;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12) return false;
  return dia >= 1 && dia <= diasEnMes(anio, mes);
};

/**
 * Normaliza a 'YYYY-MM-DD' o null. Acepta cadenas ISO (corta el tiempo) y
 * objetos Date (los que `pg` devuelve para columnas DATE: medianoche local
 * de ese día, así que los getters locales recuperan el calendario exacto).
 */
export const normalizarFecha = (valor) => {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  if (typeof valor !== 'string') return null;
  const corte = valor.slice(0, 10);
  return esFechaCalendarioValida(corte) ? corte : null;
};

/**
 * Compara dos fechas calendario normalizadas: -1, 0 o 1.
 * En formato YYYY-MM-DD el orden lexicográfico ES el orden calendario.
 * Devuelve null si alguna no normaliza.
 */
export const compararFechas = (a, b) => {
  const fa = normalizarFecha(a);
  const fb = normalizarFecha(b);
  if (!fa || !fb) return null;
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return 0;
};

const aDiasUtc = (fechaIso) => {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia) / 86_400_000;
};

/** Días calendario entre dos fechas ISO (puede ser negativo). Null si inválidas. */
export const diasEntreCalendario = (desde, hasta) => {
  const fDesde = normalizarFecha(desde);
  const fHasta = normalizarFecha(hasta);
  if (!fDesde || !fHasta) return null;
  return aDiasUtc(fHasta) - aDiasUtc(fDesde);
};

/** Hoy en America/La_Paz como 'YYYY-MM-DD'. Acepta instante para pruebas. */
export const hoyLaPazISO = (instante = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_LA_PAZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instante);
  return esFechaCalendarioValida(partes) ? partes : null;
};

/**
 * Avance del ciclo semestral en días calendario (0-100, acotado).
 * `hoyIso` se inyecta para probar bordes sin depender del reloj.
 */
export const calcularProgresoSemestral = (inicioIso, finIso, hoyIso) => {
  const total = diasEntreCalendario(inicioIso, finIso);
  if (total === null || total <= 0) return 0;
  const van = diasEntreCalendario(inicioIso, hoyIso);
  if (van === null) return 0;
  return Math.max(0, Math.min(100, Math.round((van / total) * 100)));
};

/**
 * Decisión pura de la ventana de renovación US-12 (ventana cerrada 0-30):
 * - procede=true  -> dentro de la ventana (0 a limite días restantes).
 * - motivo='lejos'   -> aún faltan más de `limite` días.
 * - motivo='vencida' -> la afiliación ya venció: corresponde afiliación
 *   nueva, no renovación.
 */
export const evaluarVentanaRenovacion = (diasRestantes, limite = 30) => {
  const dias = Number(diasRestantes);
  if (!Number.isFinite(dias)) return { procede: false, motivo: 'desconocido' };
  if (dias < 0) return { procede: false, motivo: 'vencida' };
  if (dias > limite) return { procede: false, motivo: 'lejos' };
  return { procede: true, motivo: 'dentro' };
};
