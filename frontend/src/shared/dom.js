/**
 * NÚCLEO FRONTEND — utilidades de DOM
 * -----------------------------------------------------------------------------
 * Es la única pieza que conoce el HTML. Ningún módulo de negocio debe usar
 * document.querySelector directamente: todo pasa por aquí.
 */

/** Selector único con soporte de lista. */
export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

/** Escapa texto para inserción segura en innerHTML. */
export const escapar = (valor) =>
  String(valor ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** Plural simple: elementos(1) -> 1 elemento */
export const plural = (cantidad, singular, pluralForma) =>
  `${cantidad} ${cantidad === 1 ? singular : pluralForma}`;

/** Añade listeners y devuelve la función para retirarlos (hot reload seguro). */
export const alCargar = (map) => {
  const limpieza = Object.entries(map)
    .filter(([, casos]) => Array.isArray(casos))
    .map(([selector, casos]) => {
      casos.forEach(([evento, manejador]) => $$(selector).forEach((el) => el.addEventListener(evento, manejador)));
      return () =>
        casos.forEach(([evento, manejador]) => $$(selector).forEach((el) => el.removeEventListener(evento, manejador)));
    });

  return () => limpieza.forEach((fn) => fn());
};

/**
 * Delegación de eventos: un solo listener por contenedor aunque el contenido
 * se re-renderice. Es lo que usan las listas de médicos, fechas y horarios.
 * @param {string} contenedorSelector
 * @param {string} evento
 * @param {string} gatilloSelector  elemento hijo que dispara (ej. '[data-medico]')
 * @param {(nodo: HTMLElement, evento: Event) => void} manejador
 */
export const alSeleccionar = (contenedorSelector, evento, gatilloSelector, manejador) => {
  const inscritos = $$(contenedorSelector).map((nodo) => {
    const delegado = (eventoReal) => {
      const gatillo = eventoReal.target.closest?.(gatilloSelector);
      if (!gatillo || !nodo.contains(gatillo)) return;
      manejador(gatillo, eventoReal);
    };
    nodo.addEventListener(evento, delegado);
    return { nodo, delegado };
  });
  return () => inscritos.forEach(({ nodo, delegado }) => nodo.removeEventListener(evento, delegado));
};

/** Muestra/oculta un contenedor con las clases `hidden` de Tailwind. */
export const mostrar = (elemento, visible) => {
  if (!elemento) return;
  elemento.classList.toggle('hidden', !visible);
};

/** Pone el texto de un elemento (o su placeholder si es input). */
export const texto = (elemento, valor) => {
  if (!elemento) return;
  if ('placeholder' in elemento) elemento.placeholder = valor ?? '';
  else elemento.textContent = valor ?? '';
};

/** Marca un contenedor con el estado vacío/error de los listados. */
export const estadoVacio = (contenedor, mensaje, icono = 'event_busy') => {
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div class="flex flex-col items-center justify-center gap-2 py-space-lg text-center">
      <span class="material-symbols-outlined text-[2rem] text-outline">${icono}</span>
      <p class="font-body-sm text-body-sm text-on-surface-variant">${escapar(mensaje)}</p>
    </div>`;
};
