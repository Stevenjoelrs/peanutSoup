# backend/ — API REST

Paquete independiente del monorepo. Expone la API del Seguro Social
Universitario con Express 5 y habla con Supabase Cloud (PostgreSQL 16) usando
el driver `pg` nativo, **sin ORM**: el SQL se escribe a mano y siempre
parametrizado (`$1`, `$2`, ...).

```
backend/
├── package.json                  # workspace ssu-umss-backend
├── server.js                     # arranque: config -> app -> listen
└── src/
    ├── shared/                   # infraestructura transversal
    │   ├── app.js                # composición Express
    │   ├── modules.js            # REGISTRO de módulos (fuente de verdad)
    │   ├── config/
    │   │   ├── db.js             # Pool de PostgreSQL y conTransaccion()
    │   │   └── paths.js          # rutas de carpetas del monorepo
    │   ├── http/
    │   │   ├── response.js       # successResponse / errorResponse
    │   │   ├── errors.js         # DomainError y sus fábricas
    │   │   └── manejar.js        # asyncHandler de controladores
    │   ├── middleware/
    │   │   └── errorHandler.js   # traducción de errores de infraestructura
    │   └── routes/
    │       └── system.routes.js  # /api/system/health
    └── <dominio>/                # una carpeta por módulo de negocio
```

## Capas de un módulo de negocio

`screaming architecture`: la carpeta se llama como el dominio y dentro los
archivos se llaman como la capa. El flujo de una petición va siempre en el mismo
sentido y **no se puede saltar una capa hacia atrás**.

```
  <dominio>.routes.js        HTTP: define método, ruta y middlewares. No tiene SQL.
        │
  <dominio>.controller.js    Traduce HTTP <->objeto de dominio. No tiene SQL.
        │
  <dominio>.service.js       Reglas de negocio. Lanza DomainError. No sabe de HTTP.
        │
  <dominio>.repository.js    SQL parametrizado. Es el único que consulta la base.
```

Reglas que no se negocian:

- **Solo `repository.js` escribe SQL.** Si aparece una consulta en un
  controlador, el módulo está mal partido.
- **Solo `config/db.js` pide clientes del pool.** Para una transacción se usa
  `conTransaccion(async (client) => ...)`, que hace el `COMMIT`/`ROLLBACK` en un
  solo sitio. Los repositorios re-exportan `conTransaccion` para que los
  servicios no importen el pool.
- **`service.js` nunca importa Express.** Lanza `badRequest()`, `notFound()`,
  `conflict()`, etc., y el middleware traduce.
- **`routes.js` usa `manejar()`** en vez de repetir `try/catch` en cada handler.

## Dar de alta un módulo

1. Crear `src/<dominio>/` con sus cuatro archivos de capa.
2. Importar su router en `src/shared/modules.js` y añadir una entrada a
   `apiModules` con su `prefijo` (que es contrato público: no se cambia).
3. Si tiene vista, añadir la entrada correspondiente en `vite.config.js` y en
   `pageModules`.

`app.js` no se toca: recorre el registro.

## Autenticación

La API es REST con **JWT Bearer**. `POST /api/auth/login` devuelve el token y el
frontend lo envía en `Authorization: Bearer <token>`. El middleware compartido de
autenticación (`src/shared/middleware/auth.js`) llega con el módulo `auth`;
`authenticateStudent` es permisivo (solo llena `req.user`) y `requireAuth` es el
que responde 401, de modo que un mismo router puede tener rutas públicas y
privadas.

## Comandos

```bash
pnpm --filter ssu-umss-backend dev     # node --watch server.js
pnpm --filter ssu-umss-backend start   # node server.js
```

| Ruta                     | Qué hace                                             |
| ------------------------ | ---------------------------------------------------- |
| `GET /api`               | Catálogo de módulos, generado desde `modules.js`     |
| `GET /api/system/health` | Estado de la API y de la conexión a Supabase (200/503) |
