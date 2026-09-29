import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

import { apiModules, pageModules } from './modules.js';
import { errorHandler } from './middleware/errorHandler.js';
import { FRONTEND_DIST_DIR } from './config/paths.js';
import { successResponse } from './http/response.js';

/**
 * SSU - UMSS | Composición de la aplicación Express
 * -----------------------------------------------------------------------------
 * La lista de módulos y de vistas NO se escribe aquí: vive en `modules.js` para
 * que la estructura de carpetas (screaming architecture) sea la fuente de
 * verdad y este archivo solo se encargue de concerns transversales:
 * cabeceras de seguridad, CORS, parseo del cuerpo, archivos estáticos, montaje
 * de routers, catálogo de la API y manejo de errores.
 */

/**
 * Ruta a la que se redirige cualquier URL desconocida. Se deduce del registro
 * para que, mientras el módulo `auth` exista, apunte a `/login`; y para que,
 * mientras no exista, la caída sea un 404 honesto y no un bucle de redirección.
 */
const RUTA_PORTAL = pageModules.find(({ dominio }) => dominio === 'auth')?.ruta;

export const createApp = () => {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // --- Concerns transversales -------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Tailwind vía CDN + librerías de iconos de los diseños HTML
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.tailwindcss.com',
            'https://cdnjs.cloudflare.com'
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://cdnjs.cloudflare.com'
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"]
        }
      }
    })
  );

  app.use(cors({
    origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Artefactos compilados por Vite (frontend/dist) ---------------------
  // `index: false` y `redirect: false` evitan el 301 de express.static al
  // pedir /inicio (que existe como carpeta en dist/): así la ruta limpia la
  // resuelve directamente la MPA de abajo y responde 200 sin salto extra.
  app.use(
    express.static(FRONTEND_DIST_DIR, {
      index: false,
      redirect: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
    })
  );

  // --- Módulos de API ----------------------------------------------------
  apiModules.forEach(({ prefijo, router }) => app.use(prefijo, router));

  // --- Vistas de la MPA --------------------------------------------------
  // Cada ruta limpia entrega el index.html de su carpeta en frontend/dist.
  // La autenticación se valida en el cliente (JWT) y la API exige el Bearer.
  const faltaFrontend = (res) =>
    res.status(503).type('html').send(
      `<!doctype html><html lang="es"><meta charset="utf-8">
       <title>Frontend sin compilar</title>
       <body style="font-family:Inter,system-ui,sans-serif;padding:3rem;max-width:44rem;margin:auto">
       <h1>Falta compilar el frontend</h1>
       <p>En el host: <code>pnpm build</code> o <code>docker compose up -d --build</code>.</p>
       <p>Dentro del contenedor: <code>pnpm build</code>.</p>
       <p><a href="/api">Ver la API</a></p></body></html>`
    );

  pageModules.forEach(({ ruta, carpeta }) => {
    app.get(ruta, (req, res) => {
      const indexHtml = path.join(FRONTEND_DIST_DIR, carpeta, 'index.html');
      if (!fs.existsSync(indexHtml)) return faltaFrontend(res);
      return res.sendFile(indexHtml);
    });
  });

  // --- Catálogo de la API ------------------------------------------------
  // Se genera desde el registro, de modo que nunca queda desactualizado: si un
  // módulo se da de alta en modules.js, aparece aquí automáticamente.
  app.get('/api', (req, res) => {
    res.json({
      nombre: 'API REST - Seguro Social Universitario (SSU - UMSS)',
      version: '1.0.0',
      autenticacion: 'JWT Bearer Token',
      modulos: apiModules.map(({ dominio, descripcion, prefijo, publica }) => ({
        dominio,
        descripcion,
        prefijo,
        publica
      })),
      interfaz: Object.fromEntries(pageModules.map(({ ruta, titulo }) => [ruta, titulo])),
      documentacion_ui: `http://localhost:${PORT}/`
    });
  });

  // --- Ruta desconocida --------------------------------------------------
  app.use((req, res) => {
    if (RUTA_PORTAL && req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect(302, RUTA_PORTAL);
    }
    return res.status(404).json({
      success: false,
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
    });
  });

  // --- Middleware global de errores --------------------------------------
  app.use(errorHandler);

  return app;
};

export { successResponse };
