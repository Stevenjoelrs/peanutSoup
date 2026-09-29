/**
 * MÓDULO auth — capa de datos
 * -----------------------------------------------------------------------------
 * Único punto del dominio que conoce las URLs de autenticación.
 * Contrato: POST /api/auth/login -> 200 { token, estudiante } | 400 | 401
 */
import { apiCompleta } from '../shared/http.js';
import { sesion } from '../shared/sesion.js';

/** Credenciales de demostración Precargadas en el diseño (solo desarrollo). */
export const CREDENCIALES_DEMO = { sis: '202001001', cedula_identidad: '8765432CB' };

export const iniciarSesion = ({ sis, cedula_identidad }) =>
  apiCompleta('/api/auth/login', {
    method: 'POST',
    body: { sis: sis.trim(), cedula_identidad: cedula_identidad.trim() }
  });

/** Datos del estudiante autenticado (incluye afiliación vigente). */
export const perfil = () => apiCompleta('/api/auth/me');

/**
 * Refresca los datos del estudiante en la sesión local para que el armazón
 * (nombre, cobertura) refleje los cambios sin volver a iniciar sesión.
 */
export const refrescarPerfil = async () => {
  const respuesta = await perfil();
  sesion.actualizar(respuesta.data);
  return respuesta.data;
};
