/**
 * SSU - UMSS | Modulo en desarrollo
 * -----------------------------------------------------------------------------
 * Una sola pagina sirve para todos los modulos planificados que todavia no estan
 * implementados. No decide ella cual es: lee la URL de la barra de direcciones y
 * busca el nombre en MODULOS. Cuando un modulo llegue a su turno, se borra su
 * entrada de aqui y del registro `pageModules`, y no hay que tocar nada mas.
 *
 * El shell (header, menu lateral, cierre de sesion) lo monta el nucleo
 * compartido `shared/armazon.js`, igual que en el resto de paginas.
 *
 * NOTA DE CONVENCION: este modulo no tiene `api.js` porque no consume ningun
 * endpoint. El resto de la convencion de cuatro archivos se mantiene: cuando
 * tenga endpoints que consumir, el archivo entra con esa misma forma.
 */
import { montarShell } from '../shared/armazon.js';
import { exigirSesion } from '../shared/sesion.js';

/**
 * Modulos planificados y todavia no entregados. La clave es la ruta limpia que
 * el servidor registra en `backend/src/shared/modules.js`; debe coincidir con la
 * de ahi, o el mensaje mostraria un nombre mientras el servidor sirve otro.
 */
const MODULOS = {
  '/perfil': {
    titulo: 'Mi Cuenta y Perfil',
    detalle: 'Expediente clinico, datos de contacto, consultas y recetas.'
  },
  '/registro': {
    titulo: 'Nueva Afiliacion / Registro',
    detalle: 'Verificacion de padron y solicitud de registro con declaracion jurada.'
  },
  '/afiliacion': {
    titulo: 'Afiliacion Semestral (US-01)',
    detalle: 'Solicitud de afiliacion del semestre en curso.'
  },
  '/renovacion': {
    titulo: 'Renovacion de Afiliacion (US-12)',
    detalle: 'Renovacion dentro de la ventana de 30 dias antes del vencimiento.'
  },
  '/laboratorio': {
    titulo: 'Laboratorio y Resultados (US-13)',
    detalle: 'Ordenes de laboratorio y descarga de informes.'
  }
};

export const iniciarPagina = () => {
  if (!exigirSesion()) return;
  montarShell();

  const ruta = window.location.pathname;
  const modulo = MODULOS[ruta];

  const pintar = (id, texto) => {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = texto;
  };

  pintar('modulo-ruta', ruta);

  if (!modulo) {
    // La ruta la sirve el servidor pero no esta en esta tabla. Decirlo es mejor
    // que mostrar el nombre de otro modulo.
    pintar('modulo-titulo', 'Modulo en desarrollo');
    pintar('modulo-estado', 'Este modulo todavia no tiene ficha descriptiva.');
    document.title = 'Modulo en desarrollo - SSU UMSS';
    return;
  }

  pintar('modulo-titulo', modulo.titulo);
  pintar('modulo-estado', modulo.detalle);
  document.title = `${modulo.titulo} - en desarrollo`;

  /**
   * Volver atras. `history.back()` no siempre sirve: si el estudiante entro por
   * un enlace directo no hay pagina anterior y el boton no haria nada, que es
   * peor que no ofrecerlo. Sin historial, se manda a la portada.
   */
  const boton = document.getElementById('volver-atras');
  if (boton) {
    boton.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back();
      else window.location.assign('/');
    });
  }
};
