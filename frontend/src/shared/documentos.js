/**
 * NÚCLEO FRONTEND — documentos imprimibles
 * -----------------------------------------------------------------------------
 * Los comprobantes (afiliación, ficha, informe de laboratorio) y el carnet digital
 * se sirven en HTML con autenticación Bearer. Por eso no se puede poner un
 * `<a href>` ni un `window.open(url)`: la pestaña nueva no lee el token y
 * pediría el documento sin autenticar.
 *
 * Se sigue necesitando el token, pero NO una ventana: el documento se pide con
 * `fetch`, se pinta dentro de la misma página en un `<dialog>` y desde ahí se
 * imprime o se descarga. Abrir una pestaña aparte sacaba al estudiante del
 * portal sin motivo y le dejaba un comprobante suelto, sin el resto de la
 * pantalla y sin forma de volver.
 *
 * El `<dialog>` nativo da el modal, el fondo oscurecido y el cierre con Escape
 * sin código propio. El contenido va en un `iframe` con `srcdoc`: así los estilos
 * del documento no pisan los de la aplicación y, al estar en el mismo origen, el
 * botón de imprimir puede delegar en `contentWindow.print()`.
 */
import { sesion } from './sesion.js';
import { ErrorApi } from './http.js';

const ID_MODAL = 'ssu-modal-documento';
const CLASE_MODAL = 'ssu-modal-documento';

/**
 * El `<dialog>` se crea la primera vez que hace falta y se reutiliza. No se
 * inyecta al importar el módulo: las páginas de prueba importan este archivo sin
 * tener `<dialog>` en su DOM falso, y construirlo en ese momento rompería todas
 * las pantallas.
 */
const obtenerModal = () => {
  const existente = document.getElementById(ID_MODAL);
  if (existente) return existente;

  const modal = document.createElement('dialog');
  modal.id = ID_MODAL;
  modal.className = CLASE_MODAL;
  modal.setAttribute('aria-labelledby', `${ID_MODAL}-titulo`);
  modal.innerHTML = `
    <div class="ssu-modal-caja" role="document">
      <header class="ssu-modal-cabecera">
        <div class="ssu-modal-titulos">
          <h2 class="ssu-modal-titulo" id="${ID_MODAL}-titulo">Documento</h2>
          <p class="ssu-modal-subtitulo" id="${ID_MODAL}-subtitulo"></p>
        </div>
        <button class="ssu-modal-boton ssu-modal-cerrar" type="button" title="Cerrar" aria-label="Cerrar el documento">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="ssu-modal-cuerpo">
        <iframe class="ssu-modal-marco" title="Documento" sandbox="allow-same-origin"></iframe>
      </div>
      <footer class="ssu-modal-pie">
        <p class="ssu-modal-aviso">Este documento se generó con tus datos de sesión.</p>
        <div class="ssu-modal-acciones">
          <button class="ssu-modal-boton" type="button" data-documento="descargar">
            <span class="material-symbols-outlined">download</span>
            <span>Descargar</span>
          </button>
          <button class="ssu-modal-boton ssu-modal-boton-primario" type="button" data-documento="imprimir">
            <span class="material-symbols-outlined">print</span>
            <span>Imprimir o guardar PDF</span>
          </button>
        </div>
      </footer>
    </div>`;

  const marco = modal.querySelector('.ssu-modal-marco');
  const titulo = modal.querySelector(`.${CLASE_MODAL}-titulo`);
  const subtitulo = modal.querySelector('.ssu-modal-subtitulo');

  modal.querySelector('.ssu-modal-cerrar').addEventListener('click', () => modal.close());
  modal.querySelector('[data-documento="imprimir"]').addEventListener('click', () => {
    try {
      marco.contentWindow.print();
    } catch {
      /* si el marco aún no cargó, el botón no hace nada */
    }
  });
  modal.querySelector('[data-documento="descargar"]').addEventListener('click', () => {
    descargarDocumentoActual();
  });

  // Clic en el fondo (fuera de la caja) cierra, como en cualquier modal.
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.close();
  });

  // El estilo se inyecta una vez, sin depender de que el CDN de Tailwind haya
  // detectado las clases del documento que se acaba de crear.
  if (!document.getElementById(`${ID_MODAL}-estilo`)) {
    const estilo = document.createElement('style');
    estilo.id = `${ID_MODAL}-estilo`;
    estilo.textContent = ESTILOS_MODAL;
    document.head.appendChild(estilo);
  }

  document.body.appendChild(modal);

  partes = { modal, marco, titulo, subtitulo };
  return partes;
};

let htmlActual = '';
let nombreActual = 'documento-ssu';
/** Nodos del modal ya creado, para poder repintarlo en cada apertura. */
let partes = null;

/** Styles del modal, escritos a mano para no depender del orden de Tailwind. */
const ESTILOS_MODAL = `
.${CLASE_MODAL} {
  border: 0; padding: 0; background: transparent; max-width: min(1000px, 94vw);
  width: 100%; max-height: 92vh; color: #131b2e; overflow: visible;
}
.${CLASE_MODAL}::backdrop { background: rgba(3, 25, 60, .62); }
.ssu-modal-caja {
  display: flex; flex-direction: column; max-height: 92vh; overflow: hidden;
  background: #fff; border-radius: 14px; box-shadow: 0 18px 50px rgba(3, 25, 60, .35);
}
.ssu-modal-cabecera {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 16px 20px; background: #003178; color: #fff;
}
.ssu-modal-titulos { display: flex; flex-direction: column; gap: 2px; }
.ssu-modal-titulo { margin: 0; font-size: 1.05rem; font-weight: 700; }
.ssu-modal-subtitulo { margin: 0; font-size: .8rem; opacity: .85; }
.ssu-modal-cerrar {
  background: rgba(255,255,255,.14); border: 0; border-radius: 8px; cursor: pointer;
  color: #fff; display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
}
.ssu-modal-cerrar:hover { background: rgba(255,255,255,.26); }
.ssu-modal-cuerpo { flex: 1 1 auto; min-height: 240px; background: #f4f6fb; }
.ssu-modal-marco { display: block; width: 100%; height: min(66vh, 720px); border: 0; background: #fff; }
.ssu-modal-pie {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 20px; border-top: 1px solid #e3e8f4; background: #fff;
}
.ssu-modal-aviso { margin: 0; font-size: .75rem; color: #5b6478; }
.ssu-modal-acciones { display: flex; gap: 8px; }
.ssu-modal-boton {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  border: 1px solid #c8d0e4; background: #eef1f8; color: #131b2e;
  border-radius: 9px; padding: 9px 14px; font-size: .85rem; font-weight: 600;
  font-family: inherit;
}
.ssu-modal-boton:hover { background: #e2e7f4; }
.ssu-modal-boton-primario { background: #003178; border-color: #003178; color: #fff; }
.ssu-modal-boton-primario:hover { background: #1d4ed8; border-color: #1d4ed8; }
`;

/**
 * Abre un endpoint HTML protegido dentro de la misma página.
 * @param {string} url endpoint de la API (sin ?auto=1)
 * @param {{titulo?: string, subtitulo?: string, nombre?: string}} [opciones]
 */
export const abrirDocumento = async (url, opciones = {}) => {
  const token = sesion.token;
  if (!token) throw new ErrorApi('Debe iniciar sesión para abrir el documento.', 401);

  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!respuesta.ok) {
    let mensaje = `No fue posible abrir el documento (${respuesta.status}).`;
    try {
      const cuerpo = await respuesta.json();
      if (cuerpo?.message) mensaje = cuerpo.message;
    } catch {
      /* la respuesta no era JSON */
    }
    throw new ErrorApi(mensaje, respuesta.status);
  }

  return mostrarDocumento(await respuesta.text(), {
    titulo: opciones.titulo ?? 'Documento oficial',
    subtitulo: opciones.subtitulo,
    nombre: opciones.nombre ?? 'documento-ssu'
  });
};

/**
 * Abre un documento que el propio frontend arma (por ejemplo el carnet digital).
 * Mismo modal, sin pasar por la red.
 * @param {string} html
 * @param {{titulo?: string, subtitulo?: string, nombre?: string}} [opciones]
 */
export const mostrarDocumento = (html, opciones = {}) => {
  htmlActual = html;
  nombreActual = opciones.nombre ?? 'documento-ssu';

  const { modal, marco, titulo, subtitulo } = obtenerModal();
  titulo.textContent = opciones.titulo ?? 'Documento';
  subtitulo.textContent = opciones.subtitulo ?? '';
  marco.srcdoc = html;

  if (typeof modal.showModal === 'function') modal.showModal();
  return modal;
};

/** Descarga el HTML del modal como archivo. El PDF lo genera el navegador al imprimir. */
const descargarDocumentoActual = () => {
  if (!htmlActual) return;
  const url = URL.createObjectURL(new Blob([htmlActual], { type: 'text/html;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombreActual}.html`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
