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

const abrirConfirmacion = () => {
  if (!vigenciaActual?.elegible_renovacion || !periodoSiguiente) return;
  escribir('#modal-periodo-semestral', periodoSiguiente.etiqueta);
  escribir('#modal-fecha-inicio', fechaLarga(periodoSiguiente.inicio));
  escribir('#modal-fecha-vencimiento', fechaLarga(periodoSiguiente.vencimiento));
  $('#modal-confirmacion-renovacion').showModal();
};

const confirmarRenovacion = async () => {
  if (!vigenciaActual?.elegible_renovacion || !periodoSiguiente) return;

  const boton = $('#btn-renovar');
  const botonConfirmar = $('#btn-confirmar-renovacion');
  boton.disabled = true;
  boton.style.cursor = 'wait';
  botonConfirmar.disabled = true;
  botonConfirmar.textContent = 'Procesando…';

  try {
    const resultado = await api.renovarAfiliacion({
      nuevo_periodo_semestral: periodoSiguiente.etiqueta,
      nueva_fecha_inicio: periodoSiguiente.inicio,
      nueva_fecha_vencimiento: periodoSiguiente.vencimiento
    });
    $('#modal-confirmacion-renovacion').close();
    const afiliacionRenovada = resultado?.afiliacion_renovada;
    const periodoConfirmado = afiliacionRenovada?.periodo_semestral ?? periodoSiguiente.etiqueta;
    const inicioConfirmado = afiliacionRenovada?.fecha_inicio ?? periodoSiguiente.inicio;
    const vencimientoConfirmado = afiliacionRenovada?.fecha_vencimiento ?? periodoSiguiente.vencimiento;
    escribir('#estado-afiliacion', `Semestre ${periodoConfirmado} • Activa`);
    escribir('#fecha-vencimiento', fechaLarga(vencimientoConfirmado));
    escribir('#fecha-inicio', fechaCorta(inicioConfirmado));
    escribir('#fecha-fin', fechaCorta(vencimientoConfirmado));
    escribir('.text-wrapper-7', 'Renovación confirmada');
    escribir('#mensaje-estado', 'Tu afiliación fue renovada correctamente.');
    escribir('#exito-periodo', periodoConfirmado);
    escribir('#exito-fecha-inicio', fechaLarga(inicioConfirmado));
    escribir('#exito-fecha-vencimiento', fechaLarga(vencimientoConfirmado));
    boton.disabled = true;
    boton.style.cursor = 'not-allowed';
    $('#modal-exito-renovacion').showModal();

    try {
      await refrescarPerfil();
    } catch {
      // La renovación ya fue confirmada por el servidor.
    }
  } catch (error) {
    $('#modal-confirmacion-renovacion').close();
    botonConfirmar.disabled = false;
    botonConfirmar.textContent = 'Confirmar renovación';
    boton.disabled = false;
    boton.style.cursor = 'pointer';
    escribir('.text-wrapper-7', 'Renovar');
    mostrarEstado('No se pudo completar la renovación.', error.message);
  }
};

export const iniciarPagina = () => {
  if (!exigirSesion()) return;

  alCargar({
    '#btn-renovar': [['click', abrirConfirmacion]],
    '#btn-cancelar-renovacion': [['click', () => $('#modal-confirmacion-renovacion').close()]],
    '#btn-confirmar-renovacion': [['click', confirmarRenovacion]],
    '#btn-cerrar-modal-exito': [['click', () => $('#modal-exito-renovacion').close()]],
    '#btn-cerrar-sesion': [['click', cerrarSesion]]
  });
  escribir('#nombre-estudiante', sesion.usuario?.nombre_completo ?? 'Estudiante');
  escribir('#dato-sis', `SIS: ${sesion.usuario?.sis ?? '—'}`);
  escribir('#facultad-estudiante', sesion.usuario?.facultad ?? 'Facultad');
  escribir('#dato-facultad', sesion.usuario?.facultad ?? 'Facultad —');
  cargarVigencia();
};
