# Arquitectura del sistema SSU · UMSS

Documento de referencia técnica. Para la puesta en marcha ver el
[`README.md`](../README.md); para las reglas del equipo, el
[`CONTRATO_EQUIPO.md`](CONTRATO_EQUIPO.md).

---

## 1. Decisiones estructurales y por qué

### 1.1 Monorepo con tres paquetes, sin dependencias entre ellos

`db/`, `backend/` y `frontend/` son paquetes pnpm independientes. El backend no
importa nada del frontend, el frontend no importa nada del backend, y el
corredor de migraciones no importa nada de la API.

La razón es práctica: seis personas trabajan en paralelo sobre una sola base de
datos en la nube. Un paquete que no puede importar a otro no puede romper al
otro. El costo de duplicar unas 25 líneas de configuración del pool se paga solo;
el costo de un `package.json` acoplado se paga en cada `pnpm install`.

Comunicación entre paquetes:

```
db  ─── esquema (SQL) ──────────────►  backend  ─── HTTP/JSON ───►  frontend
```

### 1.2 Una base de datos en la nube, no una en Docker

Todo el código corre en Docker; la base de datos no. La instancia de Supabase
Cloud es única y la comparten los 6 integrantes.

La consecuencia práctica que más muerde: Supabase publica el host de la base de
datos **solo con registro AAAA**, sin IPv4. Sin IPv6 habilitado en la red de
Docker, la conexión falla con `ENETUNREACH`. Por eso `docker-compose.yml`
declara subredes IPv4 e IPv6 explícitas.

### 1.3 Sin ORM

El driver `pg` nativo con `Pool`, SQL escrito a mano y siempre parametrizado. Con
9 tablas y un dominio acotado, un ORM sería una capa que hay que aprender, que
hay que versionar en cada migración y que esconde las consultas que el proyecto
necesita ver.

### 1.4 Frontend sin framework

Una MPA de JavaScript nativo compilada con Vite. Cada página es un HTML con su
propio bundle. No hay React, ni Vue, ni router de SPA.

Motivo: el sistema tiene pocas pantallas y cada una es independiente. Una
MPA da bundle chico por pantalla, URLs limpias (`/afiliacion`) que el profesor
puede abrir directo, y cero dependencias de framework que aprender.

### 1.5 El frontend lo sirve el backend

Un solo proceso y un solo puerto (3000). La API monta `frontend/dist/` como
estático y responde las rutas limpias con el `index.html` de cada carpeta.

Alternativa descartada: un contenedor nginx aparte para el frontend. Añade un
servicio, un origen más que configurar en CORS y una segunda variable de entorno
para la URL de la API, a cambio de una separación que no aporta nada aquí.

## 2. Petición de extremo a extremo

```
1.  GET /afiliacion
      Express busca la entrada en pageModules y envía frontend/dist/afiliacion/index.html

2.  El bundle JS de esa página pide datos
      fetch('/api/afiliaciones/vigencia', { headers: { Authorization: 'Bearer <jwt>' } })

3.  Express recorre apiModules y monta el router del dominio
      router.use(authenticateStudent, requireAuth)

4.  <dominio>.routes.js   traduce la URL a una llamada
      <dominio>.controller.js   arma y valida la entrada
      <dominio>.service.js      aplica reglas de negocio, lanza DomainError
      <dominio>.repository.js   ejecuta SQL parametrizado sobre el Pool

5.  La respuesta vuelve envuelta en el contrato único
      { success: true, message, data, timestamp }

6.  Un DomainError se convierte en { success: false, ... } sin tocar errorHandler.js
```

## 3. Capas del backend

`screaming architecture`: la carpeta se llama como el dominio y los archivos
como la capa.

| Capa         | Archivo                  | Puede                                                     | Nunca                        |
| ------------ | ------------------------ | --------------------------------------------------------- | ---------------------------- |
| HTTP         | `<dominio>.routes.js`    | Declarar método, ruta y middlewares                          | Escribir SQL                 |
| HTTP         | `<dominio>.controller.js`| Traducir HTTP ↔ objeto de dominio                         | Escribir SQL                 |
| Negocio      | `<dominio>.service.js`   | Aplicar reglas, lanzar `DomainError`                      | Importar Express, `req`, `res`|
| Datos        | `<dominio>.repository.js`| SQL parametrizado, `conTransaccion`                        | Interpretar reglas de negocio|

Dos invariantes que sostienen el resto:

- **Solo `repository.js` escribe SQL.** Un `SELECT` en un controlador significa
  que el módulo está mal partido.
- **Solo `config/db.js` pide clientes del pool.** Para una transacción se usa
  `conTransaccion(async (client) => ...)`, que hace `BEGIN`/`COMMIT`/`ROLLBACK`
  y `release()` en un solo sitio. Los repositorios re-exportan `conTransaccion`
  para que los servicios no tocaran el pool.

## 4. Contrato de respuesta

Único para todo el backend, definido en `src/shared/http/response.js`.

```jsonc
// éxito
{ "success": true,  "message": "...", "data": { }, "timestamp": "ISO-8601" }

// error
{ "success": false, "message": "...", "error": null,     "timestamp": "ISO-8601" }
```

`error` se puebla **solo en desarrollo**. En producción el sobre sale limpio
para no filtrar nombres de tabla, constraints ni el stack.

Errores de dominio: `badRequest` (400), `unauthorized` (401), `forbidden` (403),
`notFound` (404), `conflict` (409). Agregar un caso nuevo no obliga a tocar
`errorHandler.js`.

Errores de PostgreSQL se traducen en un solo lugar: `23505` → 409, `23503` → 400,
`22P02` → 400.

## 5. Modelo de datos

9 tablas. El detalle exacto (columnas, índices, triggers) está en los archivos de
`db/migrations/`, que son la fuente de verdad.

```
estudiantes ──< afiliaciones                (periodo semestral, estado, vigencia)
     │
     ├──< fichas_reservadas >── horarios_atencion >── medicos >── especialidades
     │        (tipo: GENERAL | INCLUSIVA | ESPECIALISTA)
     │
     ├──< ordenes_derivacion >── medicos / especialidades
     │
     ├──< ordenes_laboratorio >── medicos
     │
     └──< recetas_medicas >── ordenes_laboratorio / medicos
```

Vocabularios de estado: están en [`db/README.md`](../db/README.md) y también se
reimprimen al final de cada corrida de migraciones, para poder compararlos con
los `CHECK` que la base aceptó.

### Migraciones

- Numeración `NNN_nombre.sql`, ejecutadas en orden alfabético.
- **Idempotentes** por diseño (`IF NOT EXISTS`, `CREATE OR REPLACE`,
  `ADD COLUMN IF NOT EXISTS`). Por eso no hay tabla de control de migraciones:
  volver a correr todo es seguro, incluso tras una ejecución interrumpida.
- **Una migración ya ejecutada en la nube no se edita.** Se agrega otra.
- Solo el DB Admin las aplica contra la instancia compartida.

## 6. Registro de módulos

`backend/src/shared/modules.js` es el índice del sistema y la fuente de verdad.
`app.js` no conoce ningún módulo: solo recorre `apiModules` y `pageModules`.

```js
// Dar de alta una funcionalidad toca estos registros, no app.js:
apiModules  += { dominio, descripcion, prefijo, router, publica }
pageModules += { dominio, ruta, carpeta, requiereAuth, titulo }
frontend/vite.config.js  += { <nombre>: '<carpeta>/index.html' }
```

`GET /api` genera su catálogo desde el mismo registro, así que nunca queda
desactualizado respecto del código.

## 7. Construcción y ejecución en Docker

`Dockerfile` en cuatro capas pensadas para la caché:

1. `node:24-alpine` + pnpm 12.4.2 + `tzdata` (America/La_Paz).
2. Solo manifiestos de dependencias → `pnpm install --frozen-lockfile`. Un cambio
   de código no vuelve a descargar paquetes.
3. Código de los tres paquetes.
4. `pnpm build` → `frontend/dist` compilado **dentro** de la imagen, para que el
   contenedor sea autónomo.

En desarrollo, `docker-compose.yml` monta el repositorio del host sobre `/app` y
delega la recarga a `docker/dev-watch.sh`, que:

- compara un hash de `backend/` + `db/` → si cambia, reinicia `node backend/server.js`;
- compara un hash de `frontend/` → si cambia, recompila con Vite;
- excluye `frontend/dist` de ambos hashes, porque recompilar genera archivos
  nuevos y, si se incluyeran, cada compilación provocaría un reinicio infinito.

Docker Desktop y WSL2 no entregan de forma fiable los eventos de inotify del host
a través de un bind mount, que es exactamente el problema que este supervisor
resuelve por sondeo.

## 8. Autenticación

REST con **JWT Bearer**.

- `POST /api/auth/login` valida SIS + CI contra `estudiantes` y emite un token
  HS256 firmado con `JWT_SECRET` del entorno de cada integrante.
- El frontend lo guarda en `sessionStorage` (o `localStorage` si el estudiante
  pide "recordarme") y lo envía en `Authorization: Bearer <token>`.
- `authenticateStudent` es **permisivo**: llena `req.user` o lo deja en `null` y
  nunca rechaza. `requireAuth` es el que responde 401. Así un mismo router
  puede mezclar rutas públicas y privadas sin repetir middlewares.

El middleware llega con el módulo `auth`; está descrito en
[`backend/README.md`](../backend/README.md).

## 9. Próximos increments

| # | Rama                          | Contenido                                                        |
| - | ----------------------------- | ---------------------------------------------------------------- |
| 1 | `feature/us-afiliacion`       | Módulo `auth` + `afiliacion`: login, afiliación, renovación      |
| 2 | `feature/us-citas-medicas`    | `reserva` y `especialista`: horarios, fichas, derivaciones        |
| 3 | `feature/us-admin-panel`      | `laboratorio`, órdenes, informes y módulo de administración       |

Cada increment debe: abrir PR contra `develop`, obtener 1 aprobación, no romper
`pnpm dev` y no generar errores en la base de datos.

## 10. Riesgos conocidos

| Riesgo                                                        | Mitigación                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Doble versión de un `CHECK` de estado deja la tabla inservible | `runMigrations.mjs` reimprime los `CHECK` reales junto a los vocabularios del código |
| Una migración editada después de aplicarse en Supabase        | Archivos idempotentes + prohibitiva de editar migraciones aplicadas |
| Un `SELECT` con `FOR UPDATE` mal colocado serializa el pool   | Toda reserva de ficha va dentro de `conTransaccion`                  |
| Volumen de `/app/node_modules` obsoleto tras cambiar el lockfile | `docker compose down -v && docker compose up -d --build`            |
| `ENETUNREACH` hacia Supabase                                  | IPv6 declarado en `docker-compose.yml`                               |
| Divulgación del stack en errores de producción                 | `errorHandler` solo filtra detalles si `NODE_ENV=development`         |
