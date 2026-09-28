# frontend/ — Interfaz web

Paquete independiente del monorepo. Es una **MPA** (Multi-Page Application)
compilada con Vite 8: no hay React, ni Vue, ni Svelte, ni router de SPA, ni
código monolítico de cliente. Cada página es un documento HTML con su propio
bundle JavaScript.

```
frontend/
├── package.json          # workspace ssu-umss-frontend (vite 8.3.0)
├── vite.config.js        # raíz = src/, salida = dist/, tabla de entradas HTML
├── dist/                 # artefactos que sirve el backend (ignorado por git)
└── src/
    └── inicio/           # portada del sistema
        ├── index.html
        └── main.js
```

## Salida de compilación

`pnpm build` (desde la raíz) deja los archivos en `frontend/dist/`. Esa es la
carpeta que Express monta como estático: cada subcarpeta de `dist/` corresponde a
una URL limpia.

```
frontend/src/inicio/index.html  ->  frontend/dist/inicio/index.html  ->  GET /
```

## Cómo se agrega una página

Son dos registros obligatorios; si falta uno, la página no aparece:

1. **`frontend/vite.config.js`** → añadir la entrada en el objeto `entradas`.
   Sin esto Vite no compila el HTML y la carpeta no aparece en `dist/`.
2. **`backend/src/shared/modules.js`** → añadir la ruta en `pageModules`.
   Sin esto Express no responde a la URL limpia.

## Convención de un módulo

Cada módulo de negocio vive en `frontend/src/<dominio>/` y usa siempre los
mismos cuatro archivos. La uniformidad es deliberada: seis personas
desarrollando en paralelo necesitan poder abrir cualquier carpeta y saber
inmediatamente dónde está cada cosa.

| Archivo        | Contenido                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| `index.html`   | El diseño de la página. Un `id` por elemento que el JS vaya a tocar.         |
| `main.js`      | Cuatro líneas: `import { iniciarPagina } from './pagina.js'; iniciarPagina();` |
| `pagina.js`    | Estado de la vista, render y eventos. Exporta `iniciarPagina()`.            |
| `api.js`       | El **único** archivo del módulo que conoce URLs `/api/*`.                   |

Reglas que sostienen la convención:

- `pagina.js` no escribe una URL de la API. Pasa a `api.js`.
- `api.js` no lee el DOM. Recibe parámetros y devuelve datos.
- Ningún archivo de negocio usa `document.querySelector` directamente: los
  helpers de `src/shared/` lo encapsulan.
- Todo valor interpolado en HTML pasa por el helper de escape antes de inyectarse.

## Comandos

```bash
pnpm --filter ssu-umss-frontend dev      # Vite en 5173 con HMR y proxy /api -> 3000
pnpm --filter ssu-umss-frontend build    # compila a frontend/dist
pnpm --filter ssu-umss-frontend preview  # sirve dist/ en 4173
```

El ciclo oficial de desarrollo es Docker (`docker compose up -d --build`), que
además recompila el frontend automáticamente al detectar cambios. El servidor de
Vite queda solo para depurar una página con HMR.
