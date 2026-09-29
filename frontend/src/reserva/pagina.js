/**
 * MÓDULO reserva — vista (US-03)
 * -----------------------------------------------------------------------------
 * Flujo: turno -> médico -> fecha -> horario -> confirmar ficha.
 * Los turnos, médicos, fechas y cupos salen de /api/medicos/turnos-disponibles;
 * el comprobante se abre con el JWT (nunca como <img> o <iframe> desnudo).
 */
import { $, $$, alCargar, alSeleccionar, estadoVacio, escapar, mostrar, plural } from '../shared/dom.js';
import { fechaLarga, fechaCorta, horaCorta, soloFechaIso } from '../shared/formato.js';
import { montarShell } from '../shared/armazon.js';
import { notificar, reportarError, conBotonOcupado } from '../shared/notificaciones.js';
import { sesion, exigirSesion } from '../shared/sesion.js';
import { abrirDocumento } from '../shared/documentos.js';
import { ErrorApi } from '../shared/http.js';
import * as api from './api.js';

const TURNOS = [
  { clave: 'MANANA', etiqueta: 'Turno Mañana', icono: 'wb_sunny', rango: '08:00 - 12:00 hrs' },
  { clave: 'TARDE', etiqueta: 'Turno Tarde', icono: 'routine', rango: '12:00 - 20:00 hrs' }
];

/** Estado local de la pantalla (no se envía al servidor). */
const seleccion = { turno: 'MANANA', medico: null, fecha: null, horario: null };
let disponibilidad = [];
let fichaActiva = null;
/** Todas las fichas del estudiante: de aquí sale el día que ya no se puede repetir. */
let fichasPropias = [];

/**
 * El servidor solo admite una ficha por estudiante y día
 * (reserva.controller.js:230-250, responde 409). No tiene sentido ofrecer un día
 * que el backend va a rechazar, así que esos días salen de la tira de fechas y
 * se explica por qué. Una ficha cancelada por el propio estudiante sí libera
 * el día, igual que en el servidor.
 */
const diasConFicha = () =>
  new Set(
    fichasPropias
      .filter((f) => f.estado !== 'CANCELADA_USUARIO')
      .map((f) => soloFechaIso(f.fecha))
      .filter(Boolean)
  );

const clasificarTurno = (hora) => {
  const h = Number(String(hora).slice(0, 2));
  return h < 12 ? 'MANANA' : 'TARDE';
};

const deTurno = (clave) => disponibilidad.filter((t) => clasificarTurno(t.hora_inicio) === clave);

/**
 * Deja el turno elegido en uno que tenga cupos, pero ANTES de pintar: hacerlo
 * después dejaba el resaltado sobre una tarjeta deshabilitada, que es
 * justamente la sensación de "no me deja seleccionar turno".
 */
const resolverTurno = () => {
  if (deTurno(seleccion.turno).length) return;
  const conCupos = TURNOS.find((t) => deTurno(t.clave).length);
  seleccion.turno = conCupos ? conCupos.clave : TURNOS[0].clave;
  seleccion.medico = null;
  seleccion.fecha = null;
  seleccion.horario = null;
};

const pintarTurnos = () => {
  const contenedor = $('#turno-selector');
  const resumen = $('#cupos-resumen');
  if (!contenedor) return;

  resolverTurno();
  const total = disponibilidad.length;
  if (resumen) {
    resumen.textContent = total
      ? `${plural(total, 'cupo disponible', 'cupos disponibles')}`
      : 'Sin cupos libres';
  }

  if (!total) {
    estadoVacio(contenedor, 'No hay turnos de medicina general disponibles por ahora.', 'event_busy');
    return;
  }

  contenedor.innerHTML = TURNOS.map((turno) => {
    const cupos = deTurno(turno.clave);
    const activo = seleccion.turno === turno.clave;
    const areas = [...new Set(cupos.map((c) => c.consultorio).filter(Boolean))];
    return `
      <button class="p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container-highest transition-all flex flex-col gap-space-xs shadow-sm text-left ${activo ? 'bg-primary-container/10 ring-2 ring-secondary' : ''} disabled:opacity-40 disabled:cursor-not-allowed" data-turno="${turno.clave}" type="button" ${cupos.length ? '' : 'disabled'}>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-space-xs ${activo ? 'text-primary' : 'text-on-surface'} font-title-md text-title-md font-semibold">
            <span class="material-symbols-outlined text-[1.25rem]">${turno.icono}</span>
            <span>${escapar(turno.etiqueta)}</span>
          </div>
          <span class="material-symbols-outlined text-secondary ${activo ? '' : 'opacity-0'}">check_circle</span>
        </div>
        <span class="font-body-sm text-body-sm text-on-surface-variant">${escapar(turno.rango)}${areas.length ? ` · ${escapar(areas.join(', '))}` : ''}</span>
        <span class="font-code-sm text-code-sm text-secondary font-medium">${plural(cupos.length, 'cupo', 'cupos')}</span>
      </button>`;
  }).join('');
};

const medicosDeTurno = () => {
  const turnos = deTurno(seleccion.turno);
  const mapa = new Map();
  for (const turno of turnos) {
    const actual = mapa.get(turno.id_medico);
    if (!actual) {
      mapa.set(turno.id_medico, {
        id_medico: turno.id_medico,
        nombre: turno.medico_nombre,
        especialidad: turno.especialidad_nombre || 'Medicina General',
        cupos: 1
      });
    } else {
      actual.cupos += 1;
    }
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

const pintarMedicos = () => {
  const contenedor = $('#doctor-selector');
  const contador = $('#doctor-count');
  if (!contenedor) return;

  const medicos = medicosDeTurno();
  if (contador) {
    contador.textContent = medicos.length
      ? `${plural(medicos.length, 'profesional', 'profesionales')} disponible${medicos.length === 1 ? '' : 's'}`
      : 'Sin profesionales';
  }

  if (!medicos.length) {
    estadoVacio(contenedor, 'Este turno no tiene profesionales con cupos libres.', 'medical_services');
    seleccion.medico = null;
    return;
  }

  contenedor.innerHTML = medicos
    .map(
      (medico) => `
      <button class="w-full p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container-highest transition-all flex items-center justify-between gap-space-md text-left ${seleccion.medico === medico.id_medico ? 'bg-primary-container/10 ring-2 ring-secondary' : ''}" data-medico="${medico.id_medico}" type="button">
        <div class="flex items-center gap-space-md">
          <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[1.25rem]">stethoscope</span>
          </div>
          <div class="flex flex-col">
            <span class="font-title-md text-title-md font-semibold text-on-surface">${escapar(medico.nombre)}</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant">${escapar(medico.especialidad)}</span>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <span class="font-code-sm text-code-sm text-secondary font-medium">${plural(medico.cupos, 'cupo', 'cupos')}</span>
          <span class="material-symbols-outlined text-secondary ${seleccion.medico === medico.id_medico ? '' : 'opacity-0'}">check_circle</span>
        </div>
      </button>`
    )
    .join('');
};

const fechasDeMedico = () => {
  if (!seleccion.medico) return [];
  return [...new Set(deTurno(seleccion.turno).filter((t) => t.id_medico === seleccion.medico).map((t) => soloFechaIso(t.fecha)))]
    .sort();
};

/** Aviso corto bajo la tira de fechas: por qué faltan días o por qué no hay ninguno. */
const pintarAviso = (mensaje, icono = 'info') => {
  const caja = $('#reserva-aviso');
  if (!caja) return;
  if (!mensaje) {
    mostrar(caja, false);
    return;
  }
  caja.innerHTML = `
    <span class="material-symbols-outlined text-[1.125rem] shrink-0">${icono}</span>
    <span class="text-on-surface-variant">${escapar(mensaje)}</span>`;
  mostrar(caja, true);
};

const pintarFechas = () => {
  const tira = $('#date-strip');
  if (!tira) return;

  pintarAviso('');

  const todas = fechasDeMedico();
  const ocupadas = diasConFicha();
  const fechas = todas.filter((fecha) => !ocupadas.has(fecha));

  if (!todas.length) {
    estadoVacio(tira, 'Selecciona un profesional para ver sus fechas.', 'calendar_month');
    seleccion.fecha = null;
    return;
  }

  if (!fechas.length) {
    estadoVacio(tira, 'Ya tienes ficha reservada en los únicos días con cupos de este profesional.', 'event_busy');
    seleccion.fecha = null;
    pintarAviso('El servidor admite una sola ficha por día. Cancela la que ya tienes para reutilizar la fecha.', 'event_busy');
    return;
  }

  if (ocupadas.size) {
    const ocultas = todas.filter((fecha) => ocupadas.has(fecha)).length;
    if (ocultas) {
      pintarAviso(
        `Ocultamos ${plural(ocultas, 'día con ficha ya reservada', 'días con ficha ya reservada')}: solo se permite una ficha por día.`,
        'info'
      );
    }
  }

  if (!fechas.includes(seleccion.fecha)) seleccion.fecha = fechas[0];

  tira.innerHTML = fechas
    .map((fecha) => {
      const activa = seleccion.fecha === fecha;
      const cupos = disponibilidad.filter(
        (t) => t.id_medico === seleccion.medico && soloFechaIso(t.fecha) === fecha && clasificarTurno(t.hora_inicio) === seleccion.turno
      ).length;
      return `
        <button class="shrink-0 px-space-md py-space-sm rounded-xl border text-left transition-all ${activa ? 'bg-primary text-on-primary border-primary shadow-md' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-secondary'}" data-fecha="${fecha}" type="button">
          <span class="block font-label-sm text-label-sm uppercase opacity-80">${escapar(fechaCorta(fecha))}</span>
          <span class="block font-code-sm text-code-sm font-semibold">${cupos} ${cupos === 1 ? 'cupo' : 'cupos'}</span>
        </button>`;
    })
    .join('');
};

const pintarHorarios = () => {
  const rejilla = $('#slot-grid');
  if (!rejilla) return;

  if (!seleccion.medico || !seleccion.fecha) {
    estadoVacio(rejilla, 'Selecciona profesional y fecha para ver los horarios.', 'schedule');
    seleccion.horario = null;
    return;
  }

  const cupos = disponibilidad.filter(
    (t) => t.id_medico === seleccion.medico && soloFechaIso(t.fecha) === seleccion.fecha && clasificarTurno(t.hora_inicio) === seleccion.turno
  );

  if (!cupos.length) {
    estadoVacio(rejilla, 'No quedan cupos para esa combinación.', 'schedule');
    seleccion.horario = null;
    return;
  }

  rejilla.innerHTML = cupos
    .map(
      (turno) => `
      <button class="px-space-sm py-space-sm rounded-lg border font-code-sm text-code-sm font-semibold transition-all ${seleccion.horario === turno.id_horario ? 'bg-secondary text-on-secondary border-secondary shadow-sm' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-secondary'}" data-horario="${turno.id_horario}" type="button">
        ${escapar(horaCorta(turno.hora_inicio))}
        <span class="block font-label-sm text-label-sm font-normal opacity-80">${escapar(turno.consultorio ?? 'Consultorio a definir')}</span>
      </button>`
    )
    .join('');
};

const pintarResumen = () => {
  const resumen = $('#resumen-reserva');
  const boton = $('#btn-confirmar-reserva');
  if (resumen) {
    const turno = disponibilidad.find((t) => t.id_horario === seleccion.horario);
    resumen.textContent = turno
      ? `${fechaLarga(turno.fecha)} · ${horaCorta(turno.hora_inicio)} - ${horaCorta(turno.hora_fin)} · ${turno.medico_nombre} · ${turno.consultorio ?? 'Consultorio a definir'}`
      : 'Selecciona un profesional, una fecha y un horario.';
  }
  if (boton) boton.disabled = !seleccion.horario;
};

const refrescarSeleccion = () => {
  pintarMedicos();
  pintarFechas();
  pintarHorarios();
  pintarResumen();
};

const estadoVacioTicket = () => {
  fichaActiva = null;
  const texto = (selector, valor) => {
    const nodo = $(selector);
    if (nodo) nodo.textContent = valor;
  };
  const usuario = sesion.usuario;
  texto('#ticket-estudiante', usuario?.nombre_completo ?? '—');
  texto('#ticket-sis', `SIS: ${usuario?.sis ?? '—'}`);
  texto('#ticket-facultad', [usuario?.facultad, usuario?.carrera].filter(Boolean).join(' · ') || '—');
  texto('#ticket-medico', 'Sin turno activo');
  texto('#ticket-especialidad', '—');
  texto('#ticket-consultorio', '—');
  texto('#ticket-ubicacion', '—');
  texto('#ticket-fecha', '—');
  texto('#ticket-horario', '—');
  texto('#ticket-codigo', '—');
  texto('#ticket-numero', '—');
  texto('#ticket-turno', '—');
  texto('#ticket-estado', 'SIN TURNO');
  $$('#btn-ticket-pdf, #btn-ticket-calendar, #btn-cancelar-reserva').forEach((b) => {
    b.disabled = true;
  });
  mostrar($('#ticket-panel'), false);
};

const pintarTicket = (ficha) => {
  fichaActiva = ficha;
  const texto = (selector, valor) => {
    const nodo = $(selector);
    if (nodo) nodo.textContent = valor;
  };
  const usuario = sesion.usuario;
  const fecha = soloFechaIso(ficha.fecha);
  const codigo = `SSU-${fecha.replace(/-/g, '')}-${String(ficha.id_ficha).slice(0, 8).toUpperCase()}-SIS${usuario?.sis ?? ''}`;
  const turno = TURNOS.find((t) => t.clave === clasificarTurno(ficha.hora_inicio));

  texto('#ticket-estudiante', usuario?.nombre_completo ?? '—');
  texto('#ticket-sis', `SIS: ${usuario?.sis ?? '—'}`);
  texto('#ticket-facultad', [usuario?.facultad, usuario?.carrera].filter(Boolean).join(' · ') || '—');
  texto('#ticket-medico', ficha.medico_nombre);
  texto('#ticket-especialidad', ficha.especialidad_nombre);
  texto('#ticket-consultorio', ficha.consultorio ?? '—');
  texto('#ticket-ubicacion', 'Policlínico SSU');
  texto('#ticket-fecha', fechaLarga(ficha.fecha));
  texto('#ticket-horario', `${horaCorta(ficha.hora_inicio)} a ${horaCorta(ficha.hora_fin)}`);
  texto('#ticket-codigo', codigo);
  // El número de turno lo emite el servidor: se muestra el id corto de la ficha,
  // no un número inventado.
  texto('#ticket-numero', `FICHA #${String(ficha.id_ficha).slice(0, 8).toUpperCase()}`);
  texto('#ticket-turno', turno ? turno.etiqueta.replace('Turno ', '') : '—');
  texto('#ticket-estado', `TURNO ${ficha.estado}`);
  mostrar($('#ticket-panel'), true);

  const sinCalendario = ficha.fecha < soloFechaIso(new Date());
  $$('#btn-ticket-pdf, #btn-cancelar-reserva').forEach((b) => {
    b.disabled = false;
  });
  const calendario = $('#btn-ticket-calendar');
  if (calendario) {
    calendario.disabled = sinCalendario;
    calendario.classList.toggle('opacity-40', sinCalendario);
    calendario.classList.toggle('cursor-not-allowed', sinCalendario);
  }
};

const cargarDisponibilidad = async () => {
  const contenedor = $('#turno-selector');
  estadoVacio(contenedor, 'Consultando disponibilidad…', 'hourglass_top');
  try {
    disponibilidad = await api.turnosDisponibles();
    pintarTurnos();
    refrescarSeleccion();
  } catch (error) {
    disponibilidad = [];
    estadoVacio(contenedor, 'No se pudo consultar la disponibilidad.', 'cloud_off');
    refrescarSeleccion();
    reportarError(error);
  }
};

const cargarFichaActiva = async () => {
  try {
    fichasPropias = await api.misFichas();
    const activa = fichasPropias.find((f) => f.estado === 'RESERVADA');
    if (activa) pintarTicket(activa);
    else estadoVacioTicket();
  } catch (error) {
    estadoVacioTicket();
    reportarError(error);
  }
};

const confirmarReserva = async () => {
  if (!seleccion.horario) {
    notificar.aviso('Selecciona un horario disponible antes de confirmar.', 'Falta el horario');
    return;
  }
  try {
    const respuesta = await conBotonOcupado($('#btn-confirmar-reserva'), () => api.reservarFicha(seleccion.horario), 'Reservando...');
    seleccion.horario = null;
    notificar.exito(respuesta?.ficha ? 'Tu ficha médica general fue reservada.' : 'Ficha reservada.', 'US-03 · Reserva confirmada');
    await Promise.all([cargarDisponibilidad(), cargarFichaActiva()]);
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 409) {
      notificar.aviso(error.message, 'Cupo no disponible');
      await Promise.all([cargarDisponibilidad(), cargarFichaActiva()]);
    } else if (error instanceof ErrorApi && error.status === 400) {
      notificar.aviso(error.message, 'Solicitud incompleta');
    } else {
      reportarError(error);
    }
  }
};

const abrirComprobante = async (evento) => {
  const boton = evento.currentTarget;
  if (!fichaActiva) {
    return notificar.aviso('No tienes una ficha reservada para imprimir.', 'Sin ficha activa');
  }
  try {
    await conBotonOcupado(boton, () => abrirDocumento(api.urlComprobante(fichaActiva.id_ficha)), 'Abriendo...');
  } catch (error) {
    reportarError(error);
  }
};

/** Descarga un .ics generado en el navegador; no requiere endpoint nuevo. */
const descargarAgenda = () => {
  if (!fichaActiva) {
    return notificar.aviso('No tienes un turno activo para agregar al calendario.', 'Sin turno activo');
  }
  const ficha = fichaActiva;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${ficha.id_ficha}@ssu-umss`,
    `SUMMARY:Ficha médica SSU — ${ficha.especialidad_nombre}`,
    `DESCRIPTION:Profesional: ${ficha.medico_nombre}. Consultorio: ${ficha.consultorio ?? 'a definir'}.`,
    `DTSTART:${soloFechaIso(ficha.fecha).replace(/-/g, '')}T${String(ficha.hora_inicio).slice(0, 5).replace(':', '')}00`,
    `DTEND:${soloFechaIso(ficha.fecha).replace(/-/g, '')}T${String(ficha.hora_fin).slice(0, 5).replace(':', '')}00`,
    'LOCATION:Policlínico Seguro Social Universitario',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `ficha-ssu-${soloFechaIso(ficha.fecha)}.ics`;
  enlace.click();
  URL.revokeObjectURL(url);
  notificar.exito('Archivo de calendario descargado.', 'Agenda');
};

const cancelarReserva = () =>
  notificar.aviso(
    'La cancelación de fichas no está habilitada en el sistema; comunícate con ventanilla del Policlínico.',
    'Cancelación no disponible'
  );

export const iniciarPagina = () => {
  if (!exigirSesion()) return;

  montarShell();

  alSeleccionar('#turno-selector', 'click', '[data-turno]', (nodo) => {
    seleccion.turno = nodo.dataset.turno;
    seleccion.medico = null;
    seleccion.fecha = null;
    seleccion.horario = null;
    pintarTurnos();
    refrescarSeleccion();
  });

  alSeleccionar('#doctor-selector', 'click', '[data-medico]', (nodo) => {
    seleccion.medico = nodo.dataset.medico;
    seleccion.fecha = null;
    seleccion.horario = null;
    refrescarSeleccion();
  });

  alSeleccionar('#date-strip', 'click', '[data-fecha]', (nodo) => {
    seleccion.fecha = nodo.dataset.fecha;
    seleccion.horario = null;
    refrescarSeleccion();
  });

  alSeleccionar('#slot-grid', 'click', '[data-horario]', (nodo) => {
    seleccion.horario = nodo.dataset.horario;
    pintarHorarios();
    pintarResumen();
  });

  alCargar({
    '#btn-confirmar-reserva': [['click', confirmarReserva]],
    '#btn-ticket-pdf': [['click', abrirComprobante]],
    '#btn-ticket-calendar': [['click', descargarAgenda]],
    '#btn-cancelar-reserva': [['click', cancelarReserva]]
  });

  estadoVacioTicket();
  cargarDisponibilidad();
  cargarFichaActiva();
};
