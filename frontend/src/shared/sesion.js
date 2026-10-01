/**
 * NÚCLEO FRONTEND — sesión y almacenamiento
 * -----------------------------------------------------------------------------
 * El token JWT (HS256) viaja en el header Authorization. La decisión de dónde
 * guardarlo es de esta capa y no de las páginas: "recordarme" usa localStorage,
 * el resto de la sesión usa sessionStorage.
 */

const SSU_TOKEN = 'ssu_token';
const SSU_USUARIO = 'ssu_usuario';
const SSU_PERSISTIR = 'ssu_persistir';

const leer = (clave, memoria) => {
  try {
    return memoria.getItem(clave);
  } catch {
    return null;
  }
};

const escribir = (clave, valor, memoria) => {
  try {
    if (valor === null) memoria.removeItem(clave);
    else memoria.setItem(clave, valor);
  } catch {
    /* modo privado / storage deshabilitado: la sesión vive solo en memoria */
  }
};

export const sesion = {
  get token() {
    const local = leer(SSU_TOKEN, localStorage);
    if (local) return local;
    return leer(SSU_TOKEN, sessionStorage);
  },

  get usuario() {
    const crudo = leer(SSU_USUARIO, localStorage) ?? leer(SSU_USUARIO, sessionStorage);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo);
    } catch {
      return null;
    }
  },

  get persistida() {
    return leer(SSU_PERSISTIR, localStorage) === '1';
  },

  get activa() {
    return Boolean(this.token);
  },

  /** Inicia sesión. `recordar` decide entre localStorage y sessionStorage. */
  guardar({ token, estudiante }, recordar = false) {
    this.limpiar();
    const memoria = recordar ? localStorage : sessionStorage;
    escribir(SSU_TOKEN, token, memoria);
    escribir(SSU_USUARIO, JSON.stringify(estudiante ?? null), memoria);
    escribir(SSU_PERSISTIR, recordar ? '1' : '0', localStorage);
  },

  actualizar(estudiante) {
    const memoria = this.persistida ? localStorage : sessionStorage;
    escribir(SSU_USUARIO, JSON.stringify(estudiante), memoria);
  },

  limpiar() {
    [localStorage, sessionStorage].forEach((m) => {
      escribir(SSU_TOKEN, null, m);
      escribir(SSU_USUARIO, null, m);
    });
    escribir(SSU_PERSISTIR, null, localStorage);
  }
};

/**
 * Guarda la sesión y devuelve al usuario a la página de origen.
 * La decisión entre localStorage y sessionStorage la recibe la página, que es
 * quien conoce su checkbox: el núcleo no busca ids en el DOM.
 * @param {{ token: string, estudiante: object }} credenciales
 * @param {{ recordar?: boolean, destino?: string }} [opciones]
 */
export const iniciarSesion = (credenciales, { recordar = false, destino = '/afiliacion' } = {}) => {
  sesion.guardar(credenciales, recordar);
  const retorno = new URLSearchParams(window.location.search).get('retorno');
  window.location.assign(retorno && retorno.startsWith('/') ? retorno : destino);
};

/** Cierra sesión y vuelve a la portada pública. */
export const cerrarSesion = () => {
  sesion.limpiar();
  window.location.assign('/');
};

/**
 * Guardia de rutas: si la página exige sesión y no hay token, redirige a
 * /login conservando la ruta de origen.
 */
export const exigirSesion = () => {
  if (sesion.activa) return true;
  const destino = window.location.pathname;
  window.location.replace(`/login?retorno=${encodeURIComponent(destino)}`);
  return false;
};

/** Si ya hay sesión y se entra a /login, se salta al portal. */
export const evitarLoginRedundante = (destino = '/afiliacion') => {
  if (sesion.activa) {
    window.location.replace(destino);
    return false;
  }
  return true;
};
