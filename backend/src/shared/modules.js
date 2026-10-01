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

// --- Módulos de negocio ---------------------------------------------------
import afiliacionRoutes from '../afiliacion/afiliacion.routes.js';
import authRoutes from '../auth/auth.routes.js';
import estudiantesRoutes from '../estudiantes/estudiantes.routes.js';
import reservaRoutes from '../reserva/reserva.routes.js';
import derivacionRoutes from '../especialista/derivacion.routes.js';

// `especialista.routes.js` NO tiene export default: expone un router con nombre
// por cada prefijo de dominio, porque un mismo controlador atiende tanto la
// ficha general como la de especialista. Hay que importarlos por nombre e
// importarlos todos: un default aquí es un error de enlace entre módulos.
import {
  medicosRoutes,
  especialistasRoutes,
  fichaEspecialistaRoutes
} from '../especialista/especialista.routes.js';

// --- Infraestructura compartida -----------------------------------------
import systemRoutes from './routes/system.routes.js';

/**
 * Módulos de API. El orden solo importa para resolver prefijos ambiguos;
 * Express 5 enruta por coincidencia exacta de segmento.
 *
 * REGLA DE LOS PREFIJOS: cada entrada declara la URL base de SU dominio, nunca
 * `/api` a secas. Un prefijo shared haría que el frontend pidiera
 * `/api/fichas/reservar` y el servidor escuchara en `/api/reservar`: compila
 * igual, no da error de sintaxis, y solo falla con un 404 en la pantalla. Por eso
 * el catálogo de más abajo tiene que contrastar con lo que pide el frontend.
 */
export const apiModules = [
  {
    dominio: 'auth',
    descripcion: 'Autenticación JWT del estudiante con SIS + Cédula de Identidad',
    prefijo: '/api/auth',
    router: authRoutes,
    publica: false
  },
  {
    dominio: 'afiliacion',
    descripcion: 'Afiliación semestral del estudiante (US-01)',
    prefijo: '/api/afiliaciones',
    router: afiliacionRoutes,
    publica: false
  },
  {
    dominio: 'estudiantes',
    descripcion: 'Consulta del padrón de estudiantes',
    prefijo: '/api/estudiantes',
    router: estudiantesRoutes,
    publica: false
  },
  {
    dominio: 'reserva',
    descripcion: 'Reserva de ficha médica general e historial del estudiante (US-03)',
    prefijo: '/api/fichas',
    router: reservaRoutes,
    publica: false
  },
  {
    dominio: 'reserva',
    descripcion: 'Catálogo de turnos de medicina general (US-03)',
    prefijo: '/api/medicos',
    router: medicosRoutes,
    publica: true
  },
  {
    dominio: 'especialista',
    descripcion: 'Catálogo de horarios de especialistas (US-08)',
    prefijo: '/api/especialistas',
    router: especialistasRoutes,
    publica: true
  },
  {
    dominio: 'especialista',
    descripcion: 'Reserva de ficha con especialista (US-08)',
    prefijo: '/api/fichas-especialista',
    router: fichaEspecialistaRoutes,
    publica: false
  },
  {
    dominio: 'especialista',
    descripcion: 'Órdenes de derivación del estudiante (US-08)',
    prefijo: '/api/derivaciones',
    router: derivacionRoutes,
    publica: false
  },
  {
    dominio: 'sistema',
    descripcion: 'Health check de la API y de la conexión a Supabase',
    prefijo: '/api/system',
    router: systemRoutes,
    publica: true
  }
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
  },
  {
    dominio: 'auth',
    ruta: '/login',
    carpeta: 'auth/login',
    requiereAuth: false,
    titulo: 'Iniciar sesión'
  },
  {
    dominio: 'reserva',
    ruta: '/reserva',
    carpeta: 'reserva',
    requiereAuth: true,
    titulo: 'Reserva de Ficha Médica'
  },
  {
    dominio: 'especialista',
    ruta: '/especialista',
    carpeta: 'especialista',
    requiereAuth: true,
    titulo: 'Ficha con Especialista'
  },
  // -------------------------------------------------------------------------
  // Módulos planificados que todavía no están implementados.
  //
  // Las cinco rutas sirven la MISMA página de aviso, en vez de dejar un 404 o un
  // rebote al login. Así el menú lateral puede mostrar el alcance completo del
  // proyecto y ningún estudiante queda frente a un error o, peor, atrapado en
  // un bucle de redirección.
  //
  // Cuando un módulo se implemente, se borra su entrada de aquí, se crea su
  // carpeta en frontend/src/<dominio>/ con sus cuatro archivos, y se añade su
  // línea en el objeto `entradas` de frontend/vite.config.js. Nada más.
  // -------------------------------------------------------------------------
  {
    dominio: 'perfil',
    ruta: '/perfil',
    carpeta: 'en-desarrollo',
    requiereAuth: true,
    titulo: 'Mi Cuenta y Perfil'
  },
  {
    dominio: 'registro',
    ruta: '/registro',
    carpeta: 'en-desarrollo',
    requiereAuth: true,
    titulo: 'Nueva Afiliación / Registro'
  },
  {
    dominio: 'afiliacion',
    ruta: '/afiliacion',
    carpeta: 'en-desarrollo',
    requiereAuth: true,
    titulo: 'Afiliación Semestral'
  },
  {
    dominio: 'afiliacion',
    ruta: '/renovacion',
    carpeta: 'en-desarrollo',
    requiereAuth: true,
    titulo: 'Renovación de Afiliación'
  },
  {
    dominio: 'laboratorio',
    ruta: '/laboratorio',
    carpeta: 'laboratorio',
    requiereAuth: true,
    titulo: 'Laboratorio y Resultados'
  }
];
