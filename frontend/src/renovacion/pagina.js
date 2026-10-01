import { $, alCargar } from '../shared/dom.js';
import { fechaCorta, fechaLarga, soloFechaIso } from '../shared/formato.js';
import { cerrarSesion, exigirSesion, sesion } from '../shared/sesion.js';
import { refrescarPerfil } from '../auth/api.js';
import * as api from './api.js';

let vigenciaActual = null;
let periodoSiguiente = null;

const partesFecha = (valor) => {
  const iso = soloFechaIso(valor);
  if (!iso) return null;
  const [anio, mes] = iso.split('-').map(Number);
  return { anio, mes };
};

const isoFecha = (anio, mes, dia) =>
  `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

const semestreDeFecha = (valor) => {
  const fecha = partesFecha(valor);
  if (!fecha) return null;
  if (fecha.mes === 1) {
    return { etiqueta: `II-${fecha.anio - 1}`, inicio: isoFecha(fecha.anio - 1, 8, 1), vencimiento: isoFecha(fecha.anio, 1, 31) };
  }
  if (fecha.mes < 8) {
    return { etiqueta: `I-${fecha.anio}`, inicio: isoFecha(fecha.anio, 2, 1), vencimiento: isoFecha(fecha.anio, 7, 31) };
  }
  return { etiqueta: `II-${fecha.anio}`, inicio: isoFecha(fecha.anio, 8, 1), vencimiento: isoFecha(fecha.anio + 1, 1, 31) };
};

const siguienteSemestre = (semestre) => {
  if (!semestre) return null;
  const [numero, anioTexto] = semestre.etiqueta.split('-');
  const anio = Number(anioTexto);
  return numero === 'I'
    ? { etiqueta: `II-${anio}`, inicio: isoFecha(anio, 8, 1), vencimiento: isoFecha(anio + 1, 1, 31) }
    : { etiqueta: `I-${anio + 1}`, inicio: isoFecha(anio + 1, 2, 1), vencimiento: isoFecha(anio + 1, 7, 31) };
};

const proponerPeriodo = (datos) => {
  const afiliacion = datos?.vigente;
  const dias = Number(datos?.dias_para_vencer);
  const fechaBase = dias < 0 ? afiliacion?.fecha_servidor : afiliacion?.fecha_vencimiento;
  const semestre = semestreDeFecha(fechaBase);
  return dias < 0 ? semestre : siguienteSemestre(semestre);
};

const escribir = (selector, valor) => {
  const nodo = $(selector);
  if (nodo) nodo.textContent = valor ?? '—';
};

const mostrarEstado = (mensaje, detalle = mensaje) => {
  escribir('#mensaje-estado', mensaje);
  $('#mensaje-estado')?.setAttribute('title', detalle);
};

const pintarAfiliacion = (datos) => {
  const afiliacion = datos.vigente;
  const dias = Number(datos.dias_para_vencer);
  const limite = Number(datos.limite_renovacion_dias) || 30;
  const elegible = datos.elegible_renovacion === true;
  const estado = afiliacion.estado_efectivo ?? afiliacion.estado;
  const fechaActivacionIso = soloFechaIso(afiliacion.fecha_vencimiento);
  const fechaActivacion = fechaActivacionIso ? new Date(`${fechaActivacionIso}T12:00:00`) : null;
  if (fechaActivacion && !Number.isNaN(fechaActivacion.getTime())) {
    fechaActivacion.setDate(fechaActivacion.getDate() - limite);
  }

  vigenciaActual = datos;
  periodoSiguiente = proponerPeriodo(datos);

  escribir('#estado-afiliacion', `Semestre ${afiliacion.periodo_semestral} • ${estado === 'ACTIVA' ? 'Activa' : estado}`);
  escribir('#fecha-vencimiento', fechaLarga(afiliacion.fecha_vencimiento));
  escribir('#dias-restantes', dias < 0 ? `Vencida hace ${Math.abs(dias)} días` : `${dias} ${dias === 1 ? 'día' : 'días'}`);
  escribir('#dato-sis', `SIS: ${sesion.usuario?.sis ?? '—'}`);
  escribir('#dato-facultad', sesion.usuario?.facultad ?? 'Facultad —');
  escribir('#nombre-estudiante', sesion.usuario?.nombre_completo ?? 'Estudiante');
  escribir('#facultad-estudiante', sesion.usuario?.facultad ?? 'Facultad');
  escribir('#progreso-porcentaje', `${Math.max(0, Math.min(100, Number(datos.progreso_semestre_porcentaje) || 0))}% completado`);
  $('#progreso-barra').style.width = `${Math.max(0, Math.min(100, Number(datos.progreso_semestre_porcentaje) || 0))}%`;
  escribir('#fecha-inicio', fechaCorta(afiliacion.fecha_inicio));
  escribir('#fecha-fin', fechaCorta(afiliacion.fecha_vencimiento));
  escribir('#fecha-habilitacion', fechaActivacion && !Number.isNaN(fechaActivacion.getTime()) ? fechaLarga(fechaActivacion) : '—');

  const boton = $('#btn-renovar');
  boton.disabled = !elegible || !periodoSiguiente;
  boton.style.cursor = boton.disabled ? 'not-allowed' : 'pointer';
  boton.style.opacity = boton.disabled ? '0.6' : '1';
  mostrarEstado(
    elegible ? 'Renovación habilitada.' : `Se habilitará dentro de los ${limite} días previos al vencimiento.`,
    elegible
      ? `La renovación solicitará el periodo ${periodoSiguiente?.etiqueta ?? 'siguiente'}.`
      : `El botón se habilitará cuando falten ${limite} días o menos para el vencimiento.`
  );
};

const cargarVigencia = async () => {
  mostrarEstado('Consultando la vigencia de tu afiliación…');
  try {
    const datos = await api.consultarVigencia();
    if (!datos?.tiene_afiliacion || !datos.vigente) {
      $('#btn-renovar').disabled = true;
      escribir('#estado-afiliacion', 'Sin afiliación registrada');
      mostrarEstado('Sin afiliación para renovar.', 'Completa primero el trámite de nueva afiliación.');
      return;
    }
    pintarAfiliacion(datos);
  } catch (error) {
    $('#btn-renovar').disabled = true;
    mostrarEstado('No se pudo consultar la vigencia.', error.message);
  }
};

const confirmarRenovacion = async () => {
  if (!vigenciaActual?.elegible_renovacion || !periodoSiguiente) return;
  const confirmada = window.confirm(
    `¿Confirmas la renovación para el periodo ${periodoSiguiente.etiqueta} (${fechaCorta(periodoSiguiente.inicio)} al ${fechaCorta(periodoSiguiente.vencimiento)})?`
  );
  if (!confirmada) return;

  const boton = $('#btn-renovar');
  const etiqueta = $('.text-wrapper-7');
  boton.disabled = true;
  boton.style.cursor = 'wait';
  escribir('.text-wrapper-7', 'Procesando…');

  try {
    const resultado = await api.renovarAfiliacion({
      nuevo_periodo_semestral: periodoSiguiente.etiqueta,
      nueva_fecha_inicio: periodoSiguiente.inicio,
      nueva_fecha_vencimiento: periodoSiguiente.vencimiento
    });
    const afiliacionRenovada = resultado?.afiliacion_renovada;
    escribir('#estado-afiliacion', `Semestre ${afiliacionRenovada?.periodo_semestral ?? periodoSiguiente.etiqueta} • Activa`);
    escribir('#fecha-vencimiento', fechaLarga(afiliacionRenovada?.fecha_vencimiento ?? periodoSiguiente.vencimiento));
    escribir('#fecha-inicio', fechaCorta(afiliacionRenovada?.fecha_inicio ?? periodoSiguiente.inicio));
    escribir('#fecha-fin', fechaCorta(afiliacionRenovada?.fecha_vencimiento ?? periodoSiguiente.vencimiento));
    escribir('.text-wrapper-7', 'Renovación confirmada');
    escribir('#mensaje-estado', 'Tu afiliación fue renovada correctamente.');
    boton.disabled = true;
    boton.style.cursor = 'not-allowed';

    try {
      await refrescarPerfil();
    } catch {
      // La renovación ya fue confirmada por el servidor.
    }
    window.alert('Tu afiliación fue renovada correctamente.');
  } catch (error) {
    boton.disabled = false;
    boton.style.cursor = 'pointer';
    escribir('.text-wrapper-7', 'Renovar');
    mostrarEstado('No se pudo completar la renovación.', error.message);
  }
};

export const iniciarPagina = () => {
  if (!exigirSesion()) return;

  alCargar({
    '#btn-renovar': [['click', confirmarRenovacion]],
    '#btn-cerrar-sesion': [['click', cerrarSesion]]
  });
  escribir('#nombre-estudiante', sesion.usuario?.nombre_completo ?? 'Estudiante');
  escribir('#dato-sis', `SIS: ${sesion.usuario?.sis ?? '—'}`);
  escribir('#facultad-estudiante', sesion.usuario?.facultad ?? 'Facultad');
  escribir('#dato-facultad', sesion.usuario?.facultad ?? 'Facultad —');
  cargarVigencia();
};
