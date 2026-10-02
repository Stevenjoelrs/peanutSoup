/**
 * MÓDULO laboratorio — vista (US-13)
 * -----------------------------------------------------------------------------
 * Flujo: lista de órdenes -> click -> detalle con estado y descarga de resultado.
 * Estados: EMITIDA | EN_CURSO | FINALIZADA (solo FINALIZADA permite descarga).
 */
import { $, $$, alCargar, alSeleccionar, estadoVacio, escapar, plural } from '../shared/dom.js';
import { fechaLarga, fechaCorta, soloFechaIso } from '../shared/formato.js';
import { montarShell } from '../shared/armazon.js';
import { notificar, reportarError, conBotonOcupado, redirigirSinCobertura } from '../shared/notificaciones.js';
import { sesion, exigirSesion } from '../shared/sesion.js';
import { abrirDocumento } from '../shared/documentos.js';
import { ErrorApi } from '../shared/http.js';
import * as api from './api.js';

let ordenes = [];
let ordenSeleccionadaId = null;

const ponerTexto = (selector, valor) => {
  const nodo = $(selector);
  if (nodo) nodo.textContent = valor;
};

const chipEstado = (estado) => {
  const configs = {
    EMITIDA: { clase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icono: 'radio_button_unchecked', label: 'EMITIDA' },
    EN_CURSO: { clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icono: 'hourglass_top', label: 'EN CURSO' },
    FINALIZADA: { clase: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icono: 'check_circle', label: 'FINALIZADA' }
  };
  const cfg = configs[estado] || { clase: 'bg-surface-container-high text-on-surface-variant', icono: 'help', label: estado };
  return `<span class="inline-flex items-center gap-1 px-space-sm py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${cfg.clase}"><span class="material-symbols-outlined text-[1rem]">${cfg.icono}</span>${cfg.label}</span>`;
};

const tarjetaOrden = (orden) => {
  const esFinalizada = orden.estado === 'FINALIZADA';
  return `
    <div class="bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 flex flex-col gap-space-sm cursor-pointer hover:ring-2 hover:ring-secondary/50 ${esFinalizada ? 'ring-1 ring-green-300/50' : ''}" data-orden="${orden.id_orden_laboratorio}" tabindex="0" role="button" aria-label="Ver detalle de orden ${String(orden.id_orden_laboratorio).slice(0, 8)}">
      <div class="flex flex-col gap-space-xs">
        <div class="flex items-center justify-between gap-space-sm">
          <span class="font-code-sm text-code-sm text-on-surface-variant">#${String(orden.id_orden_laboratorio).slice(0, 8).toUpperCase()}</span>
          ${chipEstado(orden.estado)}
        </div>
        <h3 class="font-title-md text-title-md font-bold text-primary">${escapar(orden.especialidad_nombre ?? 'Examen de laboratorio')}</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Médico: ${escapar(orden.medico_emisor_nombre ?? '—')}</p>
        ${orden.observaciones_medico ? `<p class="font-body-sm text-body-sm text-on-surface-variant italic">"${escapar(orden.observaciones_medico)}"</p>` : ''}
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm pt-space-sm border-t border-outline-variant/30">
        <div class="flex items-center gap-space-xs text-on-surface-variant">
          <span class="material-symbols-outlined text-outline text-[1.125rem]">calendar_today</span>
          <span class="font-label-md text-label-md">Emitida: <strong class="text-on-surface font-semibold">${escapar(fechaLarga(orden.fecha_emision))}</strong></span>
        </div>
        <span class="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
          <span class="material-symbols-outlined text-[1rem]">chevron_right</span>
          Ver detalle
        </span>
      </div>
    </div>`;
};

const pintarLista = () => {
  const lista = $('#ordenes-lista');
  const conteo = $('#ordenes-conteo');
  const vacio = $('#estado-vacio');
  if (!lista) return;

  if (conteo) {
    conteo.textContent = ordenes.length
      ? plural(ordenes.length, 'orden', 'órdenes')
      : 'Sin órdenes de laboratorio';
  }

  if (!ordenes.length) {
    lista.innerHTML = '';
    vacio?.classList.remove('hidden');
    $('#seccion-detalle')?.classList.add('hidden');
    return;
  }

  vacio?.classList.add('hidden');
  lista.innerHTML = ordenes.map(tarjetaOrden).join('');

  // Resaltar seleccionada
  lista.querySelectorAll('[data-orden]').forEach((nodo) => {
    const seleccionada = nodo.dataset.orden === ordenSeleccionadaId;
    nodo.classList.toggle('ring-2', seleccionada);
    nodo.classList.toggle('ring-primary', seleccionada);
  });
};

const renderDetalle = (orden) => {
  const contenedor = $('#detalle-contenido');
  if (!contenedor) return;

  const esFinalizada = orden.estado === 'FINALIZADA';
  const tieneResultado = !!orden.id_resultado;

  contenedor.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <!-- Header con estado grande -->
      <div class="flex items-center justify-between flex-wrap gap-space-md p-space-md rounded-xl bg-surface-container-low">
        <div class="flex items-center gap-space-md">
          <div class="w-14 h-14 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[2rem]">science</span>
          </div>
          <div>
            <div class="flex items-center gap-space-sm mb-1">
              <span class="font-code-sm text-code-sm text-on-surface-variant">#${String(orden.id_orden_laboratorio).slice(0, 8).toUpperCase()}</span>
              ${chipEstado(orden.estado)}
            </div>
            <h3 class="font-headline-md text-headline-md text-primary">${escapar(orden.especialidad_nombre ?? 'Examen de laboratorio')}</h3>
            ${orden.especialidad_descripcion ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${escapar(orden.especialidad_descripcion)}</p>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high shrink-0">
          <span class="material-symbols-outlined text-secondary text-[1.125rem]">calendar_today</span>
          <span class="font-label-md text-label-md text-on-surface">${escapar(fechaLarga(orden.fecha_emision))}</span>
        </div>
      </div>

      <!-- Grid de información -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <div class="bg-surface-container-low p-space-md rounded-xl">
          <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Tipo de Examen / Especialidad</span>
          <p class="font-title-md text-title-md text-on-surface font-bold mt-1">${escapar(orden.especialidad_nombre ?? '—')}</p>
        </div>
        <div class="bg-surface-container-low p-space-md rounded-xl">
          <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Médico Emisor</span>
          <p class="font-title-md text-title-md text-on-surface font-bold mt-1">${escapar(orden.medico_emisor_nombre ?? '—')}</p>
        </div>
        <div class="bg-surface-container-low p-space-md rounded-xl">
          <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Fecha de Emisión</span>
          <p class="font-title-md text-title-md text-on-surface font-bold mt-1">${escapar(fechaLarga(orden.fecha_emision))}</p>
        </div>
        <div class="bg-surface-container-low p-space-md rounded-xl">
          <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Estado Actual</span>
          <p class="font-title-md text-title-md text-on-surface font-bold mt-1 flex items-center gap-2">${chipEstado(orden.estado)}</p>
        </div>
      </div>

      ${orden.observaciones_medico ? `
      <div class="bg-surface-container-low p-space-md rounded-xl border-l-4 border-secondary">
        <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Observaciones del Médico</span>
        <p class="font-body-md text-body-md text-on-surface mt-1 italic">"${escapar(orden.observaciones_medico)}"</p>
      </div>
      ` : ''}

      <!-- Sección de resultado -->
      <div class="p-space-md rounded-xl ${esFinalizada && tieneResultado ? 'bg-green-50 dark:bg-green-900/20 border border-green-200/50' : 'bg-surface-container-low'}>
        <div class="flex items-center gap-space-sm mb-2">
          <span class="material-symbols-outlined text-secondary text-[1.5rem]">${esFinalizada ? (tieneResultado ? 'check_circle' : 'hourglass_empty') : 'lock'}</span>
          <span class="font-title-md text-title-md font-semibold text-on-surface">
            ${esFinalizada
              ? (tieneResultado ? 'Resultado disponible para descarga' : 'Orden finalizada - resultado pendiente de carga')
              : 'Resultado no disponible hasta que la orden esté FINALIZADA'}
          </span>
        </div>
        ${esFinalizada && tieneResultado ? `
          <div class="flex flex-col sm:flex-row gap-space-sm pt-space-sm">
            <button class="w-full sm:w-auto px-space-lg py-space-md rounded-xl bg-primary text-on-primary font-title-md text-title-md hover:bg-secondary transition-all shadow-sm flex items-center justify-center gap-space-sm" type="button" id="btn-ver-resultado">
              <span class="material-symbols-outlined text-[1.25rem]">visibility</span>
              <span>Ver resultado</span>
            </button>
            <button class="w-full sm:w-auto px-space-lg py-space-md rounded-xl bg-surface-container-high text-on-surface font-title-md text-title-md hover:bg-surface-container transition-all flex items-center justify-center gap-space-sm" type="button" id="btn-descargar-resultado">
              <span class="material-symbols-outlined text-[1.25rem]">download</span>
              <span>Descargar PDF</span>
            </button>
            <button class="w-full sm:w-auto px-space-lg py-space-md rounded-xl bg-surface-container text-on-surface font-title-md text-title-md hover:bg-surface-container-high transition-all flex items-center justify-center gap-space-sm" type="button" id="btn-imprimir-resultado">
              <span class="material-symbols-outlined text-[1.25rem]">print</span>
              <span>Imprimir</span>
            </button>
          </div>
          ${orden.nombre_archivo ? `<p class="font-label-sm text-label-sm text-on-surface-variant mt-2 flex items-center gap-1"><span class="material-symbols-outlined text-[1rem]">description</span>Archivo: <strong>${escapar(orden.nombre_archivo)}</strong>${orden.fecha_subida ? ` · Subido: ${escapar(fechaLarga(orden.fecha_subida))}` : ''}${orden.subido_por_nombre ? ` por ${escapar(orden.subido_por_nombre)}` : ''}</p>` : ''}
        ` : ''}
        ${esFinalizada && !tieneResultado ? `
          <p class="font-body-sm text-body-sm text-on-surface-variant">La orden está FINALIZADA pero el laboratorio aún no ha subido el archivo de resultado.</p>
        ` : ''}
      </div>
    </div>`;
};

const cargarOrdenes = async () => {
  try {
    ordenes = await api.misOrdenes();
    pintarLista();
    // Si hay una orden seleccionada que ya no existe, limpiar
    if (ordenSeleccionadaId && !ordenes.find(o => o.id_orden_laboratorio === ordenSeleccionadaId)) {
      ordenSeleccionadaId = null;
      $('#seccion-detalle')?.classList.add('hidden');
      $('#seccion-ordenes')?.classList.remove('hidden');
    }
  } catch (error) {
    estadoVacio($('#ordenes-lista'), 'No se pudieron cargar tus órdenes de laboratorio.', 'cloud_off');
    reportarError(error);
  }
};

const verDetalle = async (id) => {
  ordenSeleccionadaId = id;
  try {
    const orden = await api.obtenerOrden(id);
    renderDetalle(orden);
    $('#seccion-ordenes')?.classList.add('hidden');
    $('#seccion-detalle')?.classList.remove('hidden');
    pintarLista(); // para resaltar la tarjeta

    // Eventos de botones de resultado
    const btnVer = $('#btn-ver-resultado');
    const btnDescargar = $('#btn-descargar-resultado');
    const btnImprimir = $('#btn-imprimir-resultado');

    const abrirResultado = async (evento) => {
      try {
        await conBotonOcupado(evento.currentTarget, async () => {
          const resp = await api.apiCompleta(api.urlResultado(id));
          if (resp.data?.archivo_url) {
            window.open(resp.data.archivo_url, '_blank');
          }
        }, 'Abriendo...');
      } catch (error) {
        reportarError(error);
      }
    };

    btnVer?.addEventListener('click', abrirResultado);
    btnDescargar?.addEventListener('click', abrirResultado);
    btnImprimir?.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = orden.archivo_url;
      document.body.appendChild(iframe);
      iframe.onload = () => iframe.contentWindow.print();
    });
  } catch (error) {
    if (redirigirSinCobertura(error)) {
      // redirigido al login
    } else if (error instanceof ErrorApi && [400, 404].includes(error.status)) {
      notificar.aviso(error.message, 'No se pudo cargar el detalle');
      ordenSeleccionadaId = null;
      $('#seccion-detalle')?.classList.add('hidden');
      $('#seccion-ordenes')?.classList.remove('hidden');
      pintarLista();
    } else {
      reportarError(error);
    }
  }
};

const volverLista = () => {
  ordenSeleccionadaId = null;
  $('#seccion-detalle')?.classList.add('hidden');
  $('#seccion-ordenes')?.classList.remove('hidden');
  pintarLista();
};

export const iniciarPagina = () => {
  if (!exigirSesion()) return;

  montarShell();

  // Click en tarjeta de orden
  alSeleccionar('#ordenes-lista', 'click', '[data-orden]', (nodo) => {
    verDetalle(nodo.dataset.orden);
  });

  // Enter/Space en tarjeta (accesibilidad)
  alSeleccionar('#ordenes-lista', 'keydown', '[data-orden]', (nodo, evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      verDetalle(nodo.dataset.orden);
    }
  });

  // Botón volver
  alCargar({
    '#btn-volver-lista': [['click', volverLista]]
  });

  // Pintar titular en header
  const usuario = sesion.usuario ?? {};
  const partes = [];
  if (usuario.sis) partes.push(`SIS: ${usuario.sis}`);
  if (usuario.cedula_identidad) partes.push(`C.I.: ${usuario.cedula_identidad}`);
  ponerTexto('#lab-titular-sis', usuario.nombre_completo ?? '—');
  ponerTexto('#ssu-sis-usuario', partes.join(' • ') || 'SIS: —');

  cargarOrdenes();
};