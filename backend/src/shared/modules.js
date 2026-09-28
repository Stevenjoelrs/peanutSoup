/**
 * SSU - UMSS | REGISTRO DE MÓDULOS (Screaming Architecture)
 * ===========================================================================
 * Este archivo es el índice del sistema: al leerlo de arriba abajo se ve el
 * negocio completo del SSU, no la infraestructura. Cada entrada de API declara:
 *
 *   - `dominio`      nombre del módulo de negocio
 *   - `descripcion`  qué resuelve, con su código de Historia de Usuario
 *   - `prefijo`      URL base del módulo (contrato público, no se modifica)
 *   - `router`       Express Router con los endpoints
 *   - `publica`      si el módulo se sirve sin sesión iniciada
 *
 * Y cada entrada de vista declara:
 *
 *   - `ruta`         URL limpia que ve el estudiante
 *   - `carpeta`      subcarpeta dentro de frontend/dist/ que la sirve
 *   - `requiereAuth` si la vista exige sesión (el token igual lo exige la API)
 *   - `titulo`       texto de la pestaña
 *
 * DAR DE ALTA UNA FUNCIONALIDAD = una entrada aquí + una carpeta en
 * `backend/src/<dominio>/` (con sus capas routes/controller/service/repository)
 * + una carpeta en `frontend/src/<dominio>/` + su entrada en `vite.config.js`.
 *
 * `app.js` no conoce ningún módulo: solo recorre estas listas.
 * ===========================================================================
 */

// --- Infraestructura compartida -----------------------------------------
import systemRoutes from './routes/system.routes.js';

/**
 * Módulos de API. El orden solo importa para resolver prefijos ambiguos;
 * Express 5 enruta por coincidencia exacta de segmento.
 */
export const apiModules = [
  {
    dominio: 'sistema',
    descripcion: 'Health check de la API y de la conexión a Supabase',
    prefijo: '/api/system',
    router: systemRoutes,
    publica: true
  }
  // Ejemplo de lo que se agrega al desarrollar una funcionalidad:
  // {
  //   dominio: 'afiliacion',
  //   descripcion: 'Afiliación semestral, renovación y vigencia (US-01, US-12)',
  //   prefijo: '/api/afiliaciones',
  //   router: afiliacionRoutes,
  //   publica: false
  // }
];

/**
 * Vistas de la interfaz. `carpeta` es el subdirectorio dentro de
 * frontend/dist/ que Vite genera a partir de frontend/src/<carpeta>/index.html.
 */
export const pageModules = [
  {
    dominio: 'sistema',
    ruta: '/',
    carpeta: 'inicio',
    requiereAuth: false,
    titulo: 'SSU - UMSS'
  }
  // Ejemplo:
  // { dominio: 'auth', ruta: '/login', carpeta: 'auth/login',
  //   requiereAuth: false, titulo: 'Iniciar sesión' }
];
