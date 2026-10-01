/**
 * MÓDULO especialista — vista (US-08)
 * -----------------------------------------------------------------------------
 * Flujo: orden de derivación -> especialista -> fecha -> turno -> canje atómico.
 * El botón de confirmar envía { id_horario, id_derivacion }; el servidor marca
 * la orden como UTILIZADA dentro de la misma transacción que crea la ficha.
 */
import { $, $$, alCargar, alSeleccionar, estadoVacio, escapar, plural } from '../shared/dom.js';
import { fechaLarga, fechaCorta, horaCorta, soloFechaIso } from '../shared/formato.js';
import { montarShell } from '../shared/armazon.js';
import { notificar, reportarError, conBotonOcupado, redirigirSinCobertura } from '../shared/notificaciones.js';
import { sesion, exigirSesion } from '../shared/sesion.js';
import { abrirDocumento } from '../shared/documentos.js';
import { ErrorApi } from '../shared/http.js';
import * as api from './api.js';

const seleccion = { derivacion: null, medico: null, fecha: null, horario: null };
let ordenes = [];
let turnos = [];
let fichaEmitida = null;

const ponerTexto = (selector, valor) => {
  const nodo = $(selector);
  if (nodo) nodo.textContent = valor;
};

const estaActiva = (orden) => orden.estado === 'ACTIVA';

const tarjetaOrden = (orden) => {
  const activa = estaActiva(orden);
  return `
    <div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 flex flex-col gap-space-sm ${activa ? 'ring-2 ring-secondary/80' : 'opacity-70'}">
      <div class="flex flex-col gap-space-xs">
        <div class="flex items-center justify-between gap-space-sm">
          <span class="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${activa ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-on-surface-variant'}">
            <span class="material-symbols-outlined text-[1rem]">${activa ? 'verified' : 'history'}</span>
            ${escapar(orden.estado)}
          </span>
          <span class="font-code-sm text-code-sm text-on-surface-variant">${escapar(
            fechaCorta(orden.fecha_emision)
          )}</span>
        </div>
        <h3 class="font-title-md text-title-md font-bold text-primary">${escapar(orden.especialidad_requerida)}</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Emitida por ${escapar(
          orden.medico_emisor_nombre
        )}</p>
        ${
          orden.descripcion_especialidad
            ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${escapar(orden.descripcion_especialidad)}</p>`
            : ''
        }
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm pt-space-sm">
        <div class="flex items-center gap-space-xs text-on-surface-variant">
          <span class="material-symbols-outlined text-outline text-[1.125rem]">hourglass_top</span>
          <span class="font-label-md text-label-md">Emitida: <strong class="text-on-surface font-semibold">${escapar(
            fechaLarga(orden.fecha_emision)
          )}</strong></span>
        </div>
        ${
          activa
            ? `<button class="px-space-md py-space-sm rounded-lg ${
                seleccion.derivacion === orden.id_derivacion
                  ? 'bg-primary text-on-primary'
                  : 'bg-secondary text-on-secondary'
              } font-label-md text-label-md font-semibold flex items-center justify-center gap-space-sm hover:opacity-90 transition-opacity" data-orden="${orden.id_derivacion}" type="button">
                <span class="material-symbols-outlined text-[1.125rem]">how_to_reg</span>
                <span>${seleccion.derivacion === orden.id_derivacion ? 'Orden seleccionada' : 'Seleccionar para Reserva'}</span>
              </button>`
            : '<span class="font-label-sm text-label-sm text-on-surface-variant">No utilization</span>'
        }
      </div>
    </div>`;
};

const pintarOrdenes = () => {
  const lista = $('#derivaciones-lista');
  const conteo = $('#derivaciones-conteo');
  if (!lista) return;

  const utilizables = ordenes.filter(estaActiva);
  if (conteo) {
    conteo.textContent = ordenes.length
      ? plural(ordenes.length, 'registro', 'registros')
      : 'Sin órdenes emitidas';
  }

  if (!ordenes.length) {
    estadoVacio(lista, 'No tienes órdenes de derivación. Solicítalas en Consulta Externa.', 'assignment_ind');
    return;
  }
  lista.innerHTML = ordenes.map(tarjetaOrden).join('');

  if (!utilizables.length) {
    $('#especialistas-lista') && ($('#especialistas-lista').innerHTML = '');
    ponerTexto('#especialistas-titulo', 'No hay órdenes activas');
    return;
  }
  if (!utilizables.some((o) => o.id_derivacion === seleccion.derivacion)) {
    seleccion.derivacion = utilizables[0].id_derivacion;
  }
  lista.querySelectorAll('[data-orden]').forEach((nodo) => {
    nodo.classList.toggle('bg-primary', nodo.dataset.orden === seleccion.derivacion);
    nodo.classList.toggle('text-on-primary', nodo.dataset.orden === seleccion.derivacion);
    nodo.classList.toggle('bg-secondary', nodo.dataset.orden !== seleccion.derivacion);
    nodo.classList.toggle('text-on-secondary', nodo.dataset.orden !== seleccion.derivacion);
  });
};

const ordenSeleccionada = () => ordenes.find((o) => o.id_derivacion === seleccion.derivacion);

const medicosDeTurnos = () => {
  const mapa = new Map();
  for (const turno of turnos) {
    if (!mapa.has(turno.id_medico)) {
      mapa.set(turno.id_medico, {
        id_medico: turno.id_medico,
        nombre: turno.medico_nombre,
        especialidad: turno.especialidad_nombre || '—',
        cupos: 0
      });
    }
    mapa.get(turno.id_medico).cupos += 1;
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

const pintarEspecialistas = () => {
  const lista = $('#especialistas-lista');
  const titulo = $('#especialistas-titulo');
  const filtro = $('#especialidades-filtro');
  if (!lista) return;

  const orden = ordenSeleccionada();
  if (!orden) {
    estadoVacio(lista, 'Selecciona una orden de derivación activa.', 'medical_information');
    return;
  }
  if (titulo) titulo.textContent = `Especialistas disponibles en ${orden.especialidad_requerida}`;
  if (filtro) filtro.textContent = `Filtrado automático: ${orden.especialidad_requerida}`;
  ponerTexto('#esp-orden', String(orden.id_derivacion).slice(0, 8).toUpperCase());
  // La especialidad del ticket venía escrita en el HTML; sale de la orden elegida.
  ponerTexto('#ticket-especialidad', orden.especialidad_requerida ?? '—');
  ponerTexto('#ticket-servicio', orden.descripcion_especialidad ?? '—');

  const medicos = medicosDeTurnos();
  if (!medicos.length) {
    estadoVacio(lista, 'No hay especialistas con cupos libres para esta especialidad.', 'event_busy');
    seleccion.medico = null;
    return;
  }

  lista.innerHTML = medicos
    .map(
      (medico) => `
      <button class="w-full cursor-pointer bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 flex flex-col sm:flex-row items-center gap-space-md text-left hover:bg-surface-container-low ${
        seleccion.medico === medico.id_medico ? 'ring-2 ring-primary' : ''
      }" data-medico="${medico.id_medico}" type="button">
        <div class="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[1.75rem]">stethoscope</span>
        </div>
        <div class="flex flex-col flex-1">
          <span class="font-title-md text-title-md font-bold text-on-surface">${escapar(medico.nombre)}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant">${escapar(medico.especialidad)}</span>
        </div>
        <span class="font-code-sm text-code-sm font-semibold text-primary">${plural(
          medico.cupos,
          'cupo',
          'cupos'
        )}</span>
      </button>`
    )
    .join('');
};

const fechasDeMedico = () =>
  [...new Set(turnos.filter((t) => t.id_medico === seleccion.medico).map((t) => soloFechaIso(t.fecha)))].sort();

const pintarTurnos = () => {
  const rejilla = $('#esp-turnos');
  if (!rejilla) return;

  const fechas = fechasDeMedico();
  if (!fechas.length) {
    estadoVacio(rejilla, 'Selecciona un especialista para ver sus horarios.', 'schedule');
    ponerTexto('#esp-fecha', 'Selecciona un turno');
    seleccion.horario = null;
    return;
  }
  if (!fechas.includes(seleccion.fecha)) seleccion.fecha = fechas[0];

  const cupo = turnos.find(
    (t) => t.id_medico === seleccion.medico && soloFechaIso(t.fecha) === seleccion.fecha
  );
  ponerTexto('#esp-fecha', fechaLarga(cupo.fecha));

  rejilla.innerHTML = turnos
    .filter((t) => t.id_medico === seleccion.medico && soloFechaIso(t.fecha) === seleccion.fecha)
    .map(
      (turno) => `
      <button class="p-space-sm rounded-lg font-label-md text-label-md text-center transition-colors font-bold ${
        seleccion.horario === turno.id_horario
          ? 'bg-secondary text-on-secondary shadow-sm'
          : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
      }" data-turno="${turno.id_horario}" type="button">
        ${escapar(horaCorta(turno.hora_inicio))}
        <span class="block font-label-sm text-label-sm font-normal opacity-80">${escapar(
          turno.consultorio ?? 'a definir'
        )}</span>
      </button>`
    )
    .join('');
};

const refrescarCita = () => {
  pintarEspecialistas();
  pintarTurnos();
  const boton = $('#btn-confirmar-especialista');
  if (boton) boton.disabled = !seleccion.horario || !seleccion.derivacion;
};

const cargarTurnos = async () => {
  const orden = ordenSeleccionada();
  turnos = [];
  if (!orden) {
    refrescarCita();
    return;
  }
  try {
    turnos = await api.turnosEspecialistas(orden.id_especialidad_requerida);
  } catch (error) {
    reportarError(error);
  }
  seleccion.medico = null;
  seleccion.fecha = null;
  seleccion.horario = null;
  refrescarCita();
};

const cargarOrdenes = async () => {
  try {
    ordenes = await api.derivacionesActivas();
    pintarOrdenes();
    await cargarTurnos();
  } catch (error) {
    estadoVacio($('#derivaciones-lista'), 'No se pudieron cargar tus órdenes de derivación.', 'cloud_off');
    reportarError(error);
  }
};

/**
 * Identidad del titular en la cabecera de la ficha. Venía escrita en el HTML
 * ("Univ. Alejandro Flores Montaño", "SIS: 202104829 • C.I.: 8749210 Cbba"),
 * así que el ticket mostraba siempre la misma persona, sin importar quién hubiera
 * iniciado sesión. Ahora sale de la sesión.
 */
const pintarTitular = () => {
  const usuario = sesion.usuario ?? {};
  const partes = [];
  if (usuario.sis) partes.push(`SIS: ${usuario.sis}`);
  if (usuario.cedula_identidad) partes.push(`C.I.: ${usuario.cedula_identidad}`);

  ponerTexto('#esp-titular-sis', usuario.sis ? String(usuario.sis) : '—');
  ponerTexto('#ticket-estudiante', usuario.nombre_completo ?? '—');
  ponerTexto('#ticket-estudiante-datos', partes.join(' • ') || '—');
};

const pintarFicha = (ficha) => {
  fichaEmitida = ficha;
  ponerTexto('#ticket-medico', ficha.medico_nombre);
  ponerTexto('#ticket-consultorio', `Consultorio ${ficha.consultorio ?? 'a definir'}`);
  ponerTexto('#ticket-hora', `${horaCorta(ficha.hora_inicio)} - ${horaCorta(ficha.hora_fin)}`);
  const fecha = $('#ticket-fecha');
  if (fecha) fecha.textContent = `${fechaLarga(ficha.fecha)} - `;
  ponerTexto('#ticket-hash', `SSU-HASH: ${String(ficha.id_ficha).slice(0, 8).toUpperCase()}`);
  ponerTexto('#ticket-ventanilla', `Consultorio ${ficha.consultorio ?? 'a definir'}`);
  ponerTexto('#ticket-orden', String(ficha.id_ficha ?? '').slice(0, 8).toUpperCase() || '—');
  ponerTexto('#ticket-ventanilla-hora', `Presentarse a ${horaCorta(ficha.hora_inicio)}`);
  $$('#btn-descargar-orden, #btn-imprimir-ticket').forEach((b) => {
    b.disabled = false;
  });
};

const vaciarFicha = () => {
  fichaEmitida = null;
  ponerTexto('#ticket-medico', 'Sin ficha de especialista');
  ponerTexto('#ticket-consultorio', '—');
  ponerTexto('#ticket-hora', '—');
  const fecha = $('#ticket-fecha');
  if (fecha) fecha.textContent = '—';
  ponerTexto('#ticket-hash', 'SSU-HASH: —');
  ponerTexto('#ticket-ventanilla', '—');
  ponerTexto('#ticket-orden', '—');
  ponerTexto('#ticket-ventanilla-hora', '—');
  $$('#btn-descargar-orden, #btn-imprimir-ticket').forEach((b) => {
    b.disabled = true;
  });
};

const cargarFicha = async () => {
  try {
    const fichas = await api.misFichas();
    const especialista = fichas.find((f) => f.tipo_ficha === 'ESPECIALISTA' && f.estado === 'RESERVADA');
    if (especialista) pintarFicha(especialista);
    else vaciarFicha();
  } catch (error) {
    vaciarFicha();
    reportarError(error);
  }
};

const confirmar = async () => {
  const orden = ordenSeleccionada();
  if (!orden || !seleccion.horario) {
    return notificar.aviso('Selecciona la orden y el turno antes de confirmar.', 'Faltan datos');
  }
  try {
    await conBotonOcupado($('#btn-confirmar-especialista'), () =>
      api.reservarConEspecialista({ idHorario: seleccion.horario, idDerivacion: orden.id_derivacion }), 'Confirmando...');
    seleccion.horario = null;
    notificar.exito('Turno con especialista confirmado. La orden pasó a estado UTILIZADA.', 'US-08 · Reserva confirmada');
    await Promise.all([cargarOrdenes(), cargarFicha()]);
  } catch (error) {
    if (redirigirSinCobertura(error)) {
      await Promise.all([cargarOrdenes(), cargarFicha()]);
    } else if (error instanceof ErrorApi && [400, 404, 409].includes(error.status)) {
      notificar.aviso(error.message, 'No se pudo completar el canje');
      await Promise.all([cargarOrdenes(), cargarFicha()]);
    } else {
      reportarError(error);
    }
  }
};

const descargarComprobante = async (evento) => {
  if (!fichaEmitida) return notificar.aviso('Todavía no tienes una ficha de especialista emitida.', 'Sin ficha');
  try {
    await conBotonOcupado(evento.currentTarget, () => abrirDocumento(api.urlComprobante(fichaEmitida.id_ficha)), 'Abriendo...');
  } catch (error) {
    reportarError(error);
  }
};

const imprimirTicket = () => {
  if (!fichaEmitida) return notificar.aviso('Todavía no tienes una ficha de especialista emitida.', 'Sin ficha');
  window.print();
};

export const iniciarPagina = () => {
  if (!exigirSesion()) return;

  montarShell();

  alSeleccionar('#derivaciones-lista', 'click', '[data-orden]', async (nodo) => {
    seleccion.derivacion = nodo.dataset.orden;
    seleccion.medico = null;
    seleccion.fecha = null;
    seleccion.horario = null;
    pintarOrdenes();
    await cargarTurnos();
  });

  alSeleccionar('#especialistas-lista', 'click', '[data-medico]', (nodo) => {
    seleccion.medico = nodo.dataset.medico;
    seleccion.fecha = null;
    seleccion.horario = null;
    refrescarCita();
  });

  alSeleccionar('#esp-turnos', 'click', '[data-turno]', (nodo) => {
    seleccion.horario = nodo.dataset.turno;
    refrescarCita();
  });

  alCargar({
    '#btn-confirmar-especialista': [['click', confirmar]],
    '#btn-descargar-orden': [['click', descargarComprobante]],
    '#btn-imprimir-ticket': [['click', imprimirTicket]]
  });

  vaciarFicha();
  pintarTitular();
  cargarOrdenes();
  cargarFicha();
};
