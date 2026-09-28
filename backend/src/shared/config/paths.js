/**
 * SSU - UMSS | Rutas del sistema de archivos del monorepo
 * -----------------------------------------------------------------------------
 * Resuelve las carpetas compartidas desde un solo lugar. La API y el corredor de
 * migraciones viven en paquetes pnpm distintos, asi que las rutas se calculan a
 * partir de la raiz del repositorio y no del directorio de trabajo: el proceso
 * puede arrancar desde cualquier cwd.
 *
 *   <raiz>/backend/src/shared/config/paths.js   <- este archivo
 *   <raiz>/backend/                             <- BACKEND_DIR
 *   <raiz>/                                     <- ROOT_DIR
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Carpeta del paquete backend/ (subir tres niveles: config -> shared -> src). */
export const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');

/** Raíz del monorepo: la carpeta que contiene pnpm-workspace.yaml. */
export const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Artefactos que produce `pnpm build` y que Express sirve en las rutas limpias.
 * Puede sobreescribirse con FRONTEND_DIST_DIR si alguien sirve el build desde
 * otra ruta, pero el valor por defecto es el que espera docker-compose.
 */
export const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(ROOT_DIR, 'frontend', 'dist');

/** SQL de migraciones y semillas del paquete db/. */
export const DB_DIR = path.join(ROOT_DIR, 'db');

/** Carpeta de código fuente del frontend (punto de entrada de Vite). */
export const FRONTEND_SRC_DIR = path.join(ROOT_DIR, 'frontend', 'src');
