/**
 * MÓDULO auth — vista de inicio de sesión
 * -----------------------------------------------------------------------------
 * Controlador de la página /login. No conoce la API directamente: usa auth/api.js.
 */
import { $, $$, alCargar } from '../shared/dom.js';
import { sesion, iniciarSesion as guardarSesion, evitarLoginRedundante } from '../shared/sesion.js';
import { notificar } from '../shared/notificaciones.js';
import { ErrorApi } from '../shared/http.js';
import * as auth from './api.js';

/**
 * Credenciales que el estudiante pidió recordar en este equipo. Solo se guardan
 * si "Recordar mis credenciales" estaba marcado: sin ese permiso el formulario
 * arranca vacío, y por eso el login no presume nada sobre quién eres.
 */
const CREDENCIALES_REMEMBRADAS = 'ssu_credenciales_recordadas';

const credencialesRecordadas = () => {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CREDENCIALES_REMEMBRADAS) ?? 'null');
    return guardadas?.sis && guardadas?.cedula_identidad ? guardadas : null;
  } catch {
    return null;
  }
};

const recordarCredenciales = (credenciales) => {
  try {
    if (credenciales) localStorage.setItem(CREDENCIALES_REMEMBRADAS, JSON.stringify(credenciales));
    else localStorage.removeItem(CREDENCIALES_REMEMBRADAS);
  } catch {
    /* sin almacenamiento: el formulario simplemente no se prellena */
  }
};

/**
 * Muestra el error del servidor dentro del formulario. Solo un rechazo de
 * identidad (401/403/404) abre además la salida para el estudiante que no puede
 * entrar: sin afiliación se entra igual, así que un rechazo significa que el SIS
 * no está en el padrón, y eso hay que decirlo en vez de dejar el mensaje solo.
 * Un campo vacío o un fallo de red no llevan a ese bloque: no dicen nada del
 * padrón.
 */
const mostrarError = (mensaje, { conAyuda = false } = {}) => {
  const caja = $('#login-error');
  const texto = $('#login-error-text');
  if (texto) texto.textContent = mensaje;
  caja?.classList.remove('hidden');
  caja?.classList.add('flex');
  const ayuda = $('#login-ayuda');
  if (!ayuda) return;
  ayuda.classList.toggle('hidden', !conAyuda);
  ayuda.classList.toggle('flex', conAyuda);
};

/** Oculta el error del servidor. */
const limpiarError = () => {
  const caja = $('#login-error');
  caja?.classList.add('hidden');
  caja?.classList.remove('flex');
  const ayuda = $('#login-ayuda');
  ayuda?.classList.add('hidden');
  ayuda?.classList.remove('flex');
};

const alternarAyuda = (visible) => {
  const modal = $('#helpModal');
  if (!modal) return;
  modal.classList.toggle('hidden', !visible);
  modal.classList.toggle('flex', visible);
};

const rellenarDemo = () => {
  const sis = $('#codigoSisInput');
  const ci = $('#ciInput');
  if (sis) sis.value = auth.CREDENCIALES_DEMO.sis;
  if (ci) ci.value = auth.CREDENCIALES_DEMO.cedula_identidad;
  notificar.aviso('Campos completados con las credenciales de demostración.', 'Modo demostración');
};

const enviar = async (evento) => {
  evento.preventDefault();
  limpiarError();

  const boton = $('#btnLogin');
  const sis = $('#codigoSisInput')?.value.trim() ?? '';
  const cedula = $('#ciInput')?.value.trim() ?? '';

  if (!sis || !cedula) {
    mostrarError('Ingresa tu código SIS y tu Cédula de Identidad para continuar.');
    return;
  }

  boton?.setAttribute('disabled', 'disabled');
  const etiquetaOriginal = boton?.querySelector('span')?.textContent;
  if (etiquetaOriginal) boton.querySelector('span').textContent = 'Verificando...';

  const recordar = Boolean($('#rememberCheckbox')?.checked);

  try {
    const respuesta = await auth.iniciarSesion({ sis, cedula_identidad: cedula });
    recordarCredenciales(recordar ? { sis, cedula_identidad: cedula } : null);
    if (respuesta.data?.token) {
      guardarSesion(respuesta.data, { recordar });
    }
  } catch (error) {
    const rechazoIdentidad = error instanceof ErrorApi && [401, 403, 404].includes(error.status);
    const mensaje =
      error instanceof ErrorApi
        ? error.message
        : 'No fue posible conectar con el servidor del SSU. Intente nuevamente.';
    mostrarError(mensaje, { conAyuda: rechazoIdentidad });
  } finally {
    boton?.removeAttribute('disabled');
    if (etiquetaOriginal) boton.querySelector('span').textContent = etiquetaOriginal;
  }
};

export const iniciarPagina = () => {
  if (!evitarLoginRedundante()) return;

  alCargar({
    '#studentLoginForm': [['submit', enviar]],
    '[data-accion="demo"]': [['click', rellenarDemo]],
    '[data-accion="help-toggle"]': [['click', () => alternarAyuda($('#helpModal')?.classList.contains('hidden'))]],
    '#simHelpLink': [['click', (evento) => { evento.preventDefault(); alternarAyuda(true); }]],
    '#helpModal': [['click', (evento) => { if (evento.target === evento.currentTarget) alternarAyuda(false); }]]
  });

  // Prefill: solo si el estudiante lo pidió en una visita anterior. Sin ese
  // permiso, el formulario llega vacío y "Recordar mis credenciales" sin marcar.
  const sis = $('#codigoSisInput');
  const ci = $('#ciInput');
  const recordadas = credencialesRecordadas();
  if (recordadas) {
    if (sis) sis.value = recordadas.sis;
    if (ci) ci.value = recordadas.cedula_identidad;
    const casilla = $('#rememberCheckbox');
    if (casilla) casilla.checked = true;
  }

  $$('#studentLoginForm input').forEach((campo) => campo.addEventListener('input', limpiarError));

  if (sesion.activa) console.info('[auth] ya existe una sesión activa en este navegador');
};
