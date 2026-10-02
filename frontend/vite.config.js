import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const fuente = path.join(raiz, 'src');

/**
 * SSU - UMSS | Vite en modo Multi-Page Application (MPA)
 * -----------------------------------------------------------------------------
 * Una entrada HTML + un bundle JS por módulo de negocio. No existe un cliente
 * monolítico ni un router de SPA: cada página importa solo lo que usa y el
 * backend entrega el HTML ya compilado en la ruta limpia correspondiente.
 *
  *   frontend/src/inicio/index.html   ->  frontend/dist/inicio/index.html  ->  GET /status
 *   frontend/src/auth/login/index.html -> frontend/dist/auth/login/index.html
 *
 * Para agregar una página hay que hacer DOS cosas: declararla en `entradas`
 * (que es lo que Vite compila) y registrarla en
 * `backend/src/shared/modules.js` (que es lo que Express sirve en la URL limpia).
 */
const entradas = {
  inicio: 'inicio/index.html',
  welcome: 'welcome/index.html',
  auth: 'auth/login/index.html',
  reserva: 'reserva/index.html',
  especialista: 'especialista/index.html',
  laboratorio: 'laboratorio/index.html',
  renovacion: 'renovacion/index.html',
  // Una sola pagina para los modulos planificados que aun no existen.
  // backend/src/shared/modules.js la registra bajo varias rutas limpias.
  'en-desarrollo': 'en-desarrollo/index.html'
};

export default defineConfig({
  root: fuente,
  base: '/',
  publicDir: false,
  appType: 'mpa',

  build: {
    // La salida vive en frontend/dist/ porque es la carpeta que el backend
    // monta como estático (ver backend/src/shared/config/paths.js).
    outDir: path.join(raiz, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    // No hay CSS que extraer todavía: los estilos viajan en el HTML o por CDN.
    cssCodeSplit: false,
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(entradas).map(([nombre, relativo]) => [nombre, path.join(fuente, relativo)])
      ),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  // Solo para depurar el frontend con HMR contra una API ya levantada.
  // El ciclo oficial de desarrollo sigue siendo docker compose up --build.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  },

  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
});
