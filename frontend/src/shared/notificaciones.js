/**
 * NÚCLEO FRONTEND — notificaciones
 * -----------------------------------------------------------------------------
 * Usa el contenedor #toastNotification que ya existe en los diseños; si una
 * página no lo tiene, se crea uno equivalente. La API es la misma para las
 * seis vistas:  notificar.mensaje(...) / .error(...) / .exito(...)
 */
import { $, escapar } from './dom.js';

const ICONOS = {
  exito: 'check_circle',
  error: 'error',
  aviso: 'info'
};

let temporizador = null;

const contenedor = () => {
  let nodo = $('#toastNotification');
  if (nodo) return nodo;

  nodo = document.createElement('div');
  nodo.id = 'toastNotification';
  nodo.className =
    'fixed bottom-6 right-6 z-50 transform translate-y-32 opacity-0 transition-all duration-300 pointer-events-none flex items-center gap-space-sm bg-primary text-on-primary px-space-lg py-space-md rounded-xl shadow-xl';
  nodo.innerHTML = `
    <span class="material-symbols-outlined" id="toastIcon">info</span>
    <div>
      <p class="font-label-md text-label-md font-bold" id="toastTitle"></p>
      <p class="font-body-sm text-body-sm text-primary-fixed-dim" id="toastMessage"></p>
    </div>`;
  document.body.appendChild(nodo);
  return nodo;
};

const mostrarToast = (tipo, titulo, mensaje) => {
  const nodo = contenedor();
  const icono = $('#toastIcon', nodo);
  const colorIcono =
    tipo === 'error' ? 'text-error-container' : tipo === 'aviso' ? 'text-tertiary-fixed' : 'text-primary-fixed-dim';

  if (icono) {
    icono.textContent = ICONOS[tipo] ?? ICONOS.aviso;
    icono.className = `material-symbols-outlined ${colorIcono}`;
  }

  const t = $('#toastTitle', nodo);
  const m = $('#toastMessage', nodo);
  if (t) t.textContent = titulo;
  if (m) m.textContent = mensaje ?? '';

  nodo.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    nodo.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
  }, 4200);
};

/** API pública de notificaciones. */
export const notificar = {
  exito: (mensaje, titulo = 'Operación exitosa') => mostrarToast('exito', titulo, mensaje),
  error: (mensaje, titulo = 'Ocurrió un error') => mostrarToast('error', titulo, mensaje),
  aviso: (mensaje, titulo = 'Aviso') => mostrarToast('aviso', titulo, mensaje),
  mensaje: (titulo, mensaje) => mostrarToast('aviso', titulo, mensaje)
};

/** Bloquea un botón durante una operación asíncrona (evita doble envío). */
export const conBotonOcupado = async (boton, operacion, texto = 'Procesando...') => {
  if (!boton) return operacion();
  // Se guarda innerHTML (y no textContent) porque los botones de los diseños
  // llevan icono + etiqueta anidados: restaurarlos con textContent los dejaba
  // como texto plano para siempre.
  const original = boton.innerHTML;
  const etiquetaOriginal = boton.getAttribute('aria-label');
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.classList.add('opacity-60', 'cursor-not-allowed');
  boton.textContent = texto;
  try {
    return await operacion();
  } finally {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    boton.classList.remove('opacity-60', 'cursor-not-allowed');
    boton.innerHTML = original;
    if (etiquetaOriginal === null) boton.removeAttribute('aria-label');
    else boton.setAttribute('aria-label', etiquetaOriginal);
  }
};

/** Muestra un error de API con el mensaje del backend. */
export const reportarError = (error) => {
  notificar.error(error?.message ?? 'No fue posible completar la operación.');
  if (import.meta.env?.DEV) console.error('[SSU]', error);
};

/**
 * Sin cobertura (HTTP 403 de requireCoberturaActiva): avisa y redirige a la
 * ruta sugerida por el backend (/renovacion o /registro). Devuelve true si
 * consumió el error para que la página no lo reporte dos veces.
 */
export const redirigirSinCobertura = (error) => {
  const destino = error?.status === 403 ? error?.detalles?.accion_sugerida : null;
  if (!destino || typeof destino !== 'string' || !destino.startsWith('/')) return false;
  notificar.aviso(error.message ?? 'Sin cobertura activa.', 'Afiliación requerida');
  window.setTimeout(() => window.location.assign(destino), 1600);
  return true;
};

/** Presenta un error dentro de un contenedor (no como toast). */
export const mostrarErrorEn = (elemento, error) => {
  if (!elemento) return;
  elemento.innerHTML = `<p class="font-body-sm text-body-sm text-error">${escapar(
    error?.message ?? 'Error inesperado'
  )}</p>`;
  elemento.classList.remove('hidden');
};
