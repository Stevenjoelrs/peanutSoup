/**
 * NÚCLEO FRONTEND — armazón (header + menú lateral)
 * -----------------------------------------------------------------------------
 * Los diseños HTML ya traen su propio header y aside; este módulo los conecta
 * a la sesión real en lugar de inyectar un layout duplicado. Solo necesita que
 * los puntos de anclaje existan: #ssu-user, #ssu-user-meta, #ssu-sidebar-status
 * y #ssu-logout.
 *
 * Además decide qué se ve en el menú según el estado real de la cobertura:
 *   - el panel lateral completo se despliega desde la hamburguesa del header y
 *     se puede meter en pantalla, recordando la elección;
 *   - dentro del panel, la lista de módulos se pliega aparte y también recuerda
 *     si quedó plegada;
 *   - sin cobertura vigente el estudiante cae al trámite que le corresponde;
 *   - con cobertura vigente recibe un resumen de lo que puede usar;
 *   - la renovación solo se ofrece dentro de la ventana oficial, la misma que
 *     aplica el backend, nunca antes.
 */
import { $$, $, alCargar, mostrar, escapar, plural } from './dom.js';
import { sesion, cerrarSesion } from './sesion.js';
import { fechaCorta } from './formato.js';
import { api } from './http.js';

/** Rutas del menú lateral declaradas en los diseños con data-path. */
export const RUTAS_MODULOS = {
  'ficha-medica-general': '/reserva',
  'ficha-especialista': '/especialista'
};

/**
 * Espejo de LIMITE_RENOVACION_DIAS (src/afiliacion/afiliacion.service.js:13).
 * Solo paints el primer instante, para que el menú no espere a la red.
 * `afinarRenovacion()` lo sustituye por el valor y el `elegible_renovacion`
 * que devuelve la API, así que la copia puede quedar vieja sin mentir.
 */
const LIMITE_RENOVACION_DIAS = 30;

/** Páginas del propio trámite: nunca se redirige fuera de ellas. */
const RUTAS_AFILIACION = ['/registro', '/afiliacion', '/renovacion'];

/**
 * Marca `?pendiente=1`. Es la vía de salida que el propio menú ofrece: permite
 * mirar una página (el perfil, por ejemplo) sin estar afiliado todavía. Sin ella
 * el estudiante sin cobertura quedaría encerrado en el trámite.
 */
const MARCA_PENDIENTE = 'pendiente';

/** Cachea los textos de la plantilla para el reloj del encabezado. */
const PREFIXO_RELOJ = 'Sistema SSU:';

const CLAVE_MENU_PLEGADO = 'ssu_menu_plegado';

const rutaActual = () => {
  const ruta = window.location.pathname.replace(/\/+$/, '');
  return ruta === '' ? '/' : ruta;
};

/**
 * Estado de la cobertura tal como lo ve el menú.
 *   'sin-padron'    nunca registró afiliación
 *   'sin-cobertura' tiene afiliación pero no vigente (VENCIDA / INACTIVA)
 *   'vigente'       cobertura ACTIVA
 */
const estadoAfiliacion = (afiliacion) => {
  if (!afiliacion) return 'sin-padron';
  return afiliacion.estado_efectivo === 'ACTIVA' ? 'vigente' : 'sin-cobertura';
};

const pintarUsuario = (usuario) => {
  const nombre = $('#ssu-user');
  const meta = $('#ssu-user-meta');
  if (nombre) nombre.textContent = usuario?.nombre_completo ?? 'Estudiante SSU';
  if (meta) {
    const partes = [`SIS: ${usuario?.sis ?? '—'}`];
    if (usuario?.facultad) partes.push(usuario.facultad.replace(/^Fac\.\s*/, 'Fac. de '));
    meta.textContent = partes.join(' · ');
  }
};

/**
 * Panel de cobertura del menú lateral. La maqueta trae aquí un "Seguro Activo
 * 2024-II" de ejemplo, así que este painting no puede conformarse con borrar o
 * dejar el texto: se repinta siempre, y cuando no hay cobertura se dice que no
 * la hay. Un estudiante sin afiliación no puede leer que tiene el seguro activo.
 */
const pintarEstadoCobertura = (afiliacion) => {
  const panel = $('#ssu-sidebar-status');
  if (!panel) return;

  const envolver = (icono, tono, titulo, detalle) => `
    <div class="flex items-start gap-space-sm">
      <span class="material-symbols-outlined ${tono} text-[1.25rem]">${icono}</span>
      <div>
        <p class="font-label-sm text-label-sm font-semibold text-on-surface">${titulo}</p>
        <p class="font-code-sm text-code-sm text-on-surface-variant">${detalle}</p>
      </div>
    </div>`;

  if (!afiliacion) {
    panel.innerHTML = envolver(
      'person_off',
      'text-outline',
      'Sin afiliación registrada',
      'Formalízala en /registro'
    );
    return;
  }

  const vigente = afiliacion.estado_efectivo === 'ACTIVA';
  panel.innerHTML = envolver(
    vigente ? 'verified_user' : 'error',
    vigente ? 'text-secondary' : 'text-error',
    `Seguro ${vigente ? 'Activo' : 'Inactivo'} ${afiliacion.periodo_semestral ?? ''}`.trim(),
    `Vigencia: ${fechaCorta(afiliacion.fecha_vencimiento)}`
  );
};

/** Enlace corto dentro de la tarjeta del menú. */
const atajo = (ruta, texto) =>
  `<a class="flex items-center justify-between gap-2 rounded-lg bg-surface-container-high px-space-sm py-1.5 font-label-sm text-label-sm font-semibold text-primary hover:bg-secondary hover:text-on-secondary transition-colors" href="${ruta}"><span>${escapar(
    texto
  )}</span><span class="material-symbols-outlined text-[1rem]">chevron_right</span></a>`;

/**
 * ¿La renovación aplica ahora? Una afiliación vencida siempre entra en la
 * ventana; una INACTIVA solo si ya está cerca del vencimiento, porque si no el
 * backend la rechaza con "No procede la renovación" y el estudiante aterriza en
 * una pantalla que no puede resolver.
 */
const dentroDeVentana = (afiliacion) => {
  if (!afiliacion) return false;
  if (afiliacion.estado_efectivo === 'VENCIDA') return true;
  const dias = Number(afiliacion.dias_para_vencer);
  return Number.isFinite(dias) && dias <= LIMITE_RENOVACION_DIAS;
};

/** Salida de emergencia para el estudiante sin cobertura: puede mirar sin afiliarse. */
const salirSinAfiliarse = () =>
  `<a class="font-label-sm text-label-sm text-on-surface-variant hover:text-primary underline transition-colors" href="/perfil?${MARCA_PENDIENTE}=1">Solo quería consultar mis datos</a>`;

/**
 * Tarjeta de arriba del menú: bienvenida con el resumen real de la cobertura, o
 * el aviso de lo que falta. Es la respuesta a "dónde está mi seguro", sin
 * obligar a abrir la cobertura antes de leerla.
 */
const pintarBienvenida = (usuario) => {
  const contenedor = $('#ssu-bienvenida');
  if (!contenedor) return;

  const afiliacion = usuario?.afiliacion ?? null;
  const estado = estadoAfiliacion(afiliacion);
  const primerNombre = (usuario?.nombre_completo ?? '').trim().split(' ')[0];
  const dias = Number(afiliacion?.dias_para_vencer);
  // Si ya está en una de las páginas del trámite, el botón sería un bucle.
  const enElTramite = RUTAS_AFILIACION.includes(rutaActual());

  const tarjeta = (icono, tono, titulo, cuerpo, acciones = '') => `
    <div class="rounded-xl bg-surface-container/60 p-space-sm flex flex-col gap-space-sm">
      <div class="flex items-start gap-space-sm">
        <span class="material-symbols-outlined ${tono} text-[1.25rem]">${icono}</span>
        <div class="flex flex-col gap-0.5">
          <p class="font-label-sm text-label-sm font-semibold text-on-surface">${titulo}</p>
          <p class="font-label-sm text-label-sm text-on-surface-variant leading-snug">${cuerpo}</p>
        </div>
      </div>
      ${acciones}
    </div>`;

  if (estado === 'vigente') {
    const resumen = Number.isFinite(dias)
      ? dias > 0
        ? `Vence en ${plural(dias, 'día', 'días')}, el ${fechaCorta(afiliacion.fecha_vencimiento)}.`
        : `Venció el ${fechaCorta(afiliacion.fecha_vencimiento)}.`
      : `Vence el ${fechaCorta(afiliacion.fecha_vencimiento)}.`;
    contenedor.innerHTML = tarjeta(
      'verified_user',
      'text-secondary',
      escapar(primerNombre ? `Hola, ${primerNombre}` : 'Bienvenido al SSU'),
      escapar(
        `Cobertura activa en Gestión ${afiliacion.periodo_semestral ?? '—'}. ${resumen}`
      ),
      `<div class="flex flex-col gap-1">${atajo('/perfil', 'Mi perfil y datos')}${atajo(
        '/reserva',
        'Reservar ficha médica'
      )}</div>`
    );
    return;
  }

  if (estado === 'sin-cobertura') {
    const renovar = dentroDeVentana(afiliacion);
    const accion = renovar
      ? atajo('/renovacion', 'Renovar mi afiliación')
      : atajo('/afiliacion', 'Ver mi afiliación');
    contenedor.innerHTML = tarjeta(
      'error',
      'text-error',
      'Tu cobertura no está vigente',
      escapar(
        `La afiliación de Gestión ${afiliacion.periodo_semestral ?? '—'} no está vigente. Sin cobertura no hay consultas, urgencias 24h, laboratorio ni farmacia.`
      ),
      enElTramite ? '' : `<div class="flex flex-col gap-1">${accion}${salirSinAfiliarse()}</div>`
    );
    return;
  }

  contenedor.innerHTML = tarjeta(
    'person_off',
    'text-outline',
    'Falta tu afiliación',
    'Sin afiliación no hay consultas médicas, urgencias 24h, laboratorio ni farmacia. El padrón lo carga la Universidad y el trámite se formaliza aquí.',
    enElTramite ? '' : `<div class="flex flex-col gap-1">${atajo('/registro', 'Afiliarme ahora')}${salirSinAfiliarse()}</div>`
  );
};

/**
 * Oculta la renovación cuando todavía no toca.
 *
 * El criterio es el del backend: `afiliacion.service.js:107` rechaza renovar
 * mientras resten más de 30 días. Ofrecer el enlace fuera de esa ventana
 * mostraría un trámite que el SSU va a rechazar. Cuando la API responde, manda
 * su `elegible_renovacion` y esta copia del límite deja de decidir.
 */
const pintarModulos = (usuario, limite = LIMITE_RENOVACION_DIAS, elegible = null) => {
  const renovacion = $('[data-path="renovacion-afiliacion"]');
  if (!renovacion) return;

  const afiliacion = usuario?.afiliacion ?? null;
  const dias = Number(afiliacion?.dias_para_vencer);

  const porRegla =
    elegible !== null
      ? Boolean(elegible)
      : !afiliacion
        ? false
        : afiliacion.estado_efectivo === 'ACTIVA'
          ? !Number.isFinite(dias) || dias <= limite
          : // Una afiliación vencida siempre está dentro de la ventana: se renueva.
            true;

  // El módulo de la página abierta nunca se esconde, o el estudiante se
  // quedaría sin forma de volver al menú.
  const enEstaPagina = RUTAS_MODULOS[renovacion.dataset.path] === rutaActual();
  renovacion.classList.toggle('hidden', !(porRegla || enEstaPagina));
};

/**
 * El enlace del módulo abierto se marca con `aria-current="page"`. Cada maqueta
 * ya trae el aspecto en su HTML, así que aquí solo se corrige el atributo:
 * reescribir las clases de diseño pelearía con ellas y dependería de su orden.
 */
const marcarActivo = () => {
  const actual = rutaActual();
  for (const enlace of $$('[data-path]')) {
    if (RUTAS_MODULOS[enlace.dataset.path] === actual) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
};

let menuVisible = true;

const menuPlegado = () => {
  try {
    return localStorage.getItem(CLAVE_MENU_PLEGADO) === '1';
  } catch {
    return false;
  }
};

const recordarMenuPlegado = (plegado) => {
  try {
    if (plegado) localStorage.setItem(CLAVE_MENU_PLEGADO, '1');
    else localStorage.removeItem(CLAVE_MENU_PLEGADO);
  } catch {
    /* modo privado: el menú simplemente no recuerda */
  }
};

const aplicarPlegado = () => {
  const boton = $('#ssu-menu-toggle');
  if (boton) boton.setAttribute('aria-expanded', String(menuVisible));
  mostrar($('#ssu-modulos'), menuVisible);
  const icono = $('#ssu-menu-icono');
  if (icono) icono.textContent = menuVisible ? 'expand_less' : 'expand_more';
};

const enlazarMenu = () => {
  $$('[data-path]').forEach((enlace) => {
    const ruta = RUTAS_MODULOS[enlace.dataset.path];
    if (!ruta) return;
    enlace.href = ruta;
    enlace.addEventListener('click', (evento) => {
      if (enlace.getAttribute('href') === ruta) {
        evento.preventDefault();
        window.location.assign(ruta);
      }
    });
  });
};

const enlazarPlegado = () => {
  const boton = $('#ssu-menu-toggle');
  if (!boton) return;
  menuVisible = !menuPlegado();
  aplicarPlegado();
  boton.addEventListener('click', () => {
    menuVisible = !menuVisible;
    recordarMenuPlegado(!menuVisible);
    aplicarPlegado();
  });
};

/* ------------------------------------------------------------------ */
/* Desplegar u ocultar el panel lateral completo                       */
/* ------------------------------------------------------------------ */

const CLAVE_SIDEBAR_OCULTO = 'ssu_sidebar_oculto';

/**
 * El panel lateral entero (módulos, bienvenida y cobertura) se puede meter en la
 * pantalla desde la hamburguesa del encabezado. Se desliza hacia la izquierda en
 * vez de desaparecer de golpe, y al irse el contenido recupera todo el ancho
 * (deja los 18rem que `pl-72` le reservaba). La elección se recuerda entre
 * visitas, igual que el plegado de la lista de módulos.
 */
let panelLateralVisible = true;

const panelOculto = () => {
  try {
    return localStorage.getItem(CLAVE_SIDEBAR_OCULTO) === '1';
  } catch {
    return false;
  }
};

const recordarPanelOculto = (oculto) => {
  try {
    if (oculto) localStorage.setItem(CLAVE_SIDEBAR_OCULTO, '1');
    else localStorage.removeItem(CLAVE_SIDEBAR_OCULTO);
  } catch {
    /* modo privado: el panel simplemente no recuerda */
  }
};

const aplicarPanel = () => {
  $('#ssu-sidebar')?.classList.toggle('su-menu-oculto', !panelLateralVisible);
  $('#ssu-contenido')?.classList.toggle('su-contenido-abierto', !panelLateralVisible);

  const boton = $('#ssu-sidebar-toggle');
  if (boton) boton.setAttribute('aria-expanded', String(panelLateralVisible));
  const icono = $('#ssu-sidebar-icono');
  if (icono) icono.textContent = panelLateralVisible ? 'close' : 'menu';
};

const alternarPanel = (visibilidad) => {
  panelLateralVisible = visibilidad ?? !panelLateralVisible;
  recordarPanelOculto(!panelLateralVisible);
  aplicarPanel();
};

const enlazarPanel = () => {
  const boton = $('#ssu-sidebar-toggle');
  if (!boton) return;

  panelLateralVisible = !panelOculto();
  aplicarPanel();

  boton.addEventListener('click', () => alternarPanel());

  // Escape cierra el panel sin ir hasta la hamburguesa. Se escucha en <body>,
  // donde burbuja toda tecla desde cualquier punto de la página.
  alCargar({
    body: [
      [
        'keydown',
        (evento) => {
          if (evento.key === 'Escape' && panelLateralVisible) alternarPanel(false);
        }
      ]
    ]
  });
};

const iniciarReloj = () => {
  const nodo = $$('span').find((el) => el.textContent.trim().startsWith(PREFIXO_RELOJ));
  if (!nodo) return;
  const pintar = () => {
    const ahora = new Date();
    nodo.textContent = `Sistema SSU: ${fechaCorta(ahora)} - ${ahora.toLocaleTimeString('es-BO')}`;
  };
  pintar();
  setInterval(pintar, 1000);
};

/**
 * Sin cobertura vigente el estudiante cae al trámite que le corresponde:
 * `/registro` si nunca se afilió; si tiene una afiliación que ya no está
 * vigente, a `/renovacion` cuando la ventana de renovación está abierta y a
 * `/afiliacion` cuando no, para no mandarlo a una pantalla que solo puede
 * decirle que no procede.
 *
 * Se excluyen las tres páginas del propio trámite para no montar un bucle, y
 * `?pendiente=1` porque es la salida que el menú ofrece. `replace` en vez de
 * `assign` para no dejar la página bloqueada en el historial del navegador.
 */
const vigilarAfiliacion = (usuario) => {
  if (!usuario) return;
  const estado = estadoAfiliacion(usuario.afiliacion);
  if (estado === 'vigente') return;

  if (RUTAS_AFILIACION.includes(rutaActual())) return;
  if (new URLSearchParams(window.location.search).has(MARCA_PENDIENTE)) return;

  const destino =
    estado === 'sin-padron' ? '/registro' : dentroDeVentana(usuario.afiliacion) ? '/renovacion' : '/afiliacion';
  window.location.replace(`${destino}?${MARCA_PENDIENTE}=1`);
};

/**
 * El menú no decide la ventana de renovación por su cuenta: pide a la API el
 * `limite_renovacion_dias` y el `elegible_renovacion` reales, que son los que
 * aplican. Si la llamada falla se conserva el valor espejo y el estudiante ve
 * la ventana de siempre: es el backend el que acepta o rechaza el trámite.
 */
const afinarRenovacion = async (usuario) => {
  if (!usuario?.afiliacion) return;
  let limite = LIMITE_RENOVACION_DIAS;
  let elegible = null;
  try {
    const vigencia = await api('/api/afiliaciones/vigencia');
    if (Number.isFinite(Number(vigencia?.limite_renovacion_dias))) {
      limite = Number(vigencia.limite_renovacion_dias);
    }
    elegible = vigencia?.elegible_renovacion ?? null;
  } catch {
    return;
  }
  pintarModulos(usuario, limite, elegible);
};

/**
 * Repinta usuario, cobertura y menú sin volver a enlazar nada. Se usa después
 * de un trámite que cambia la afiliación, porque `montarShell()` solo lee la
 * sesión al arrancar y el panel del sidebar se quedaría con el estado anterior.
 */
export const refrescarArmazon = () => {
  const usuario = sesion.usuario;
  pintarUsuario(usuario);
  pintarEstadoCobertura(usuario?.afiliacion);
  pintarBienvenida(usuario);
  pintarModulos(usuario);
  afinarRenovacion(usuario);
};

/**
 * Monta el armazón de la aplicación. Idempotente: puede llamarse una vez por
 * página sin duplicar listeners.
 */
export const montarShell = () => {
  const usuario = sesion.usuario;
  vigilarAfiliacion(usuario);
  pintarUsuario(usuario);
  pintarEstadoCobertura(usuario?.afiliacion);
  pintarBienvenida(usuario);
  pintarModulos(usuario);
  marcarActivo();
  enlazarMenu();
  enlazarPlegado();
  enlazarPanel();
  iniciarReloj();

  $$('#ssu-logout').forEach((boton) => boton.addEventListener('click', cerrarSesion));
  afinarRenovacion(usuario);
};
