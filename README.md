# SSU · UMSS — Sistema Web del Seguro Social Universitario

Monorepo del sistema web del Seguro Social Universitario de la Universidad Mayor
de San Simón. Cubre el **Módulo Estudiantil** y el **Módulo de Administración**.

Materia: Sistemas de Información 2 ·UMSS· Cochabamba, Bolivia
Idioma del código, la base de datos y la interfaz: **español**

---

## 1. Qué corre y dónde

- **Todo el código corre en Docker.** Un solo servicio (`app`) levanta la API
  Express y sirve la interfaz web compilada.
- **La base de datos no está en Docker.** El equipo trabaja contra **una única
  instancia en la nube** (Supabase Cloud, PostgreSQL 16) compartida por los 6
  integrantes. No hay servicio de base de datos en `docker-compose.yml` a
  propósito: un PostgreSQL local produciría dos bases divergentes y los errores
  aparecerían solo en la nube.

```
  navegador ──►  contenedor Docker  ──►  Supabase Cloud
                 :3000                     PostgreSQL 16
                 API Express 5  ◄───────   Pool `pg` sobre SSL
                 + dist/ estático
```

## 2. Estructura del repositorio

Monorepo con `pnpm` y tres paquetes independientes. Ninguno importa código de
otro: se comunican por HTTP (backend ↔ frontend) o por el esquema (db ↔ ambos).

```
ssu-umss-web/
├── package.json              # raíz: scripts que orquestan los tres paquetes
├── pnpm-workspace.yaml       # declaration de los paquetes
├── pnpm-lock.yaml            # lockfile oficial (no editar a mano)
├── docker-compose.yml        # el servicio app; sin base de datos
├── Dockerfile                # imagen con Node 24 + pnpm 12.4.2
│
├── db/                       # ESQUEMA
│   ├── package.json          #   workspace ssu-umss-db
│   ├── runMigrations.mjs     #   corredor de migraciones
│   ├── seeds.sql             #   datos de prueba
│   └── migrations/*.sql      #   DDL ordenado e idempotente
│
├── backend/                  # API
│   ├── package.json          #   workspace ssu-umss-backend
│   ├── server.js             #   arranque
│   └── src/
│       ├── shared/           #   infraestructura transversal
│       │   ├── app.js        #     composición Express
│       │   ├── modules.js    #     REGISTRO de módulos (fuente de verdad)
│       │   ├── config/       #     Pool de PostgreSQL, rutas
│       │   ├── http/         #     contrato de respuesta, errores de dominio
│       │   ├── middleware/   #     traducción de errores
│       │   └── routes/       #     /api/system/health
│       └── <dominio>/        #   una carpeta por módulo de negocio
│
├── frontend/                 # INTERFAZ
│   ├── package.json          #   workspace ssu-umss-frontend
│   ├── vite.config.js        #   raíz = src/, salida = dist/, tabla de entradas
│   └── src/<dominio>/        #   una carpeta por página (MPA)
│
├── docker/dev-watch.sh       # supervisor de recarga del contenedor
├── docs/                     # arquitectura y contrato del equipo
└── .env.example              # plantilla de variables de entorno
```

Detalles de cada paquete: [`db/README.md`](db/README.md),
[`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md).

## 3. Stack tecnológico

Versiones fijadas por el contrato del equipo para que el proyecto funcione igual
en Windows, macOS y Arch Linux.

| Herramienta / librería     | Versión        | Para qué                                              |
| -------------------------- | -------------- | ----------------------------------------------------- |
| Gestor de paquetes         | pnpm 12.4.2    | Instalación eficiente y `pnpm-lock.yaml` único        |
| Entorno de ejecución       | Node.js 24 LTS | Incluido en la imagen Docker                           |
| Contenedorización         | Docker Engine  | Homogeneiza los 3 sistemas operativos del equipo      |
| Base de datos              | PostgreSQL 16  | Supabase Cloud, instancia única compartida            |
| Driver de base de datos   | pg 8.23.x      | `Pool` nativo, SQL directo, **sin ORM**               |
| Framework / seguridad      | express 5.2.x  | API REST                                              |
| Seguridad HTTP            | helmet 8.x     | Cabeceras de seguridad                                 |
| Cross-origin               | cors 2.8.x     | Peticiones del frontend al backend                    |
| Autenticación              | jsonwebtoken 9 | JWT Bearer (ver nota abajo)                            |
| Build del frontend         | Vite 8.3.0     | Empaquetado rápido, módulos ES nativos                 |
| Configuración              | dotenv 16.6.1  | Variables de entorno desde `.env`                     |

> **Desviación respecto al contrato:** el contrato enumera cinco dependencias y
> no incluye `jsonwebtoken`, pero la autenticación acordada es JWT Bearer y sin
> esa librería no hay token que emitir. Se agregó `jsonwebtoken ^9.0.2` a
> `backend/`. Es la única dependencia añadida y la decisión es del DB Admin /
> backend; queda registrada aquí para que sea visible en la revisión.

El frontend **no usa framework**: es una MPA de JavaScript nativo con Vite. No
hay React, Vue, ni router de SPA. Ver `frontend/README.md`.

## 4. Puesta en marcha

Requisitos: **Docker Desktop** o Docker Engine con Compose v2. Node y pnpm solo
hacen falta si se trabaja fuera del contenedor.

```bash
# 1. Configura tus credenciales (el .env NUNCA se sube)
cp .env.example .env

# 2. Edita .env y pega tu DATABASE_URL de Supabase.
#    El DB Admin la entrega por el canal oficial del equipo.

# 3. Aplica el esquema (solo el DB Admin lo ejecuta contra la nube)
pnpm migrate
#    o, cargando además los datos de prueba:
pnpm seed

# 4. Levanta el sistema
docker compose up -d --build

# 5. Comprueba
#    interfaz ....... http://localhost:3000/
#    catálogo API ... http://localhost:3000/api
#    salud .......... http://localhost:3000/api/system/health
```

Los comandos 3 y 4 también funcionan dentro del contenedor, sin instalar nada en
el host:

```bash
docker compose run --rm app pnpm migrate
docker compose run --rm app pnpm seed
```

### Problemas frecuentes

| Síntoma                                         | Causa y solución                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ENETUNREACH` al conectar con la base           | Falta IPv6 en la red de Docker. `docker-compose.yml` ya la habilita; verifica con `docker compose down -v` |
| `Cannot find module 'vite'`                     | El volumen de `/app/node_modules` quedó obsoleto: `docker compose down -v && docker compose up -d --build` |
| `Falta compilar el frontend` (HTTP 503)         | Corre `pnpm build` o reconstruye la imagen                                                          |
| La interfaz no refleja cambios                  | `docker compose logs -f app` y revisa que el volumen esté montado                                     |

## 5. Comandos

Desde la raíz del repositorio:

| Comando                      | Qué hace                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `pnpm install`               | Instala los tres paquetes y genera/actualiza el lockfile     |
| `pnpm migrate`               | Aplica `db/migrations/*.sql` a Supabase                     |
| `pnpm seed`                  | Migra y además carga `db/seeds.sql`                         |
| `pnpm build`                 | Compila el frontend a `frontend/dist/`                      |
| `pnpm dev`                   | API con `node --watch` (requiere Node 24 en el host)        |
| `pnpm start`                 | API en modo producción                                      |
| `pnpm test`                  | Pruebas de los paquetes que las tengan                      |
| `pnpm dev:up` / `dev:down`   | Atajos de `docker compose up -d --build` / `down`            |
| `pnpm dev:logs`              | Sigue los logs del contenedor                               |

## 6. Variables de entorno

Todas se declaran en `.env`, que está en `.gitignore` y **no puede subirse nunca**.
La plantilla completa está en [`.env.example`](.env.example).

| Variable                        | Obligatoria | Descripción                                                        |
| ------------------------------- | ----------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                  | sí          | Cadena de conexión a Supabase. Alternativa: las variables `PG*`     |
| `PORT`                          | no          | Puerto del servidor. Por defecto `3000`                            |
| `NODE_ENV`                      | no          | `development` o `production`. Filtra los detalles internos de error  |
| `JWT_SECRET`                    | sí          | Secreto de firma HS256. Cada integrante genera el suyo              |
| `JWT_EXPIRES_IN`                | no          | Vigencia del token. Por defecto `8h`                                |
| `PGSSL`                         | no          | `true` fuerza SSL. Con una URL de `supabase.co` se activa solo     |
| `PG_POOL_MAX`                   | no          | Conexiones máximas del pool. Por defecto `20`                       |
| `FRONTEND_DIST_DIR`             | no          | Ruta alternativa de `frontend/dist/`                                |

## 7. Reglas de trabajo en Git

Extraídas del contrato del equipo ([`docs/CONTRATO_EQUIPO.md`](docs/CONTRATO_EQUIPO.md)).
Este es un resumen; el contrato manda.

### Ramas

| Rama      | Para qué                                                          |
| --------- | ----------------------------------------------------------------- |
| `main`    | Código probado, estable y listo para la presentación académica     |
| `develop` | Integración continua: aquí se prueban las funcionalidades unidas   |
| `feature/us-<historia>` | Trabajo individual (`feature/us-afiliacion`, `feature/us-citas-medicas`, `feature/us-admin-panel`) |

### Commits

Prefijo de propósito + descripción breve en **minúsculas y modo imperativo**:

```
feat: agrega el componente de barra de busqueda
fix: corrige el desbordamiento de texto en las tarjetas
chore: actualiza las dependencias del frontend
```

Tipos en uso: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`.

### Pull requests

- **Prohibido** `push` o `merge` directo a `main`.
- Todo PR requiere aprobación de **al menos 1** integrante encargado del code review.
- No se aprueba un PR que rompa `pnpm dev` o que genere errores en la base de datos.
- Todo PR sale de `develop` hacia `develop`, salvo el de/release a `main`.

### Fin de línea

El equipo usa Windows, macOS y Arch Linux, así que el repositorio guarda LF:

```bash
git config core.autocrlf input    # ejecutar una vez en cada clon
```

`.gitattributes` y `.editorconfig` ya están configurados en el repositorio.

## 8. Reglas de la base de datos

1. **Una sola instancia en la nube**, compartida por los 6 integrantes. La
   configuración va en el `.env` personal mediante `DATABASE_URL`.
2. **Prohibido subir `.env`** al repositorio.
3. **Prohibido alterar el esquema** desde la interfaz gráfica de Supabase sin
   consentimiento del equipo.
4. Todo cambio estructural (`CREATE TABLE`, `ALTER TABLE`, restricciones) se
   guarda en un archivo **nuevo** de `db/migrations/`, numerado y **idempotente**.
   Una migración ya ejecutada en la nube no se edita: se agrega otra.
5. El **DB Admin** (Steven Joel Ramos Salazar) es el único autorizado para
   ejecutar las migraciones finales en la nube.

Detalle de los vocabularios de estado y del esquema actual: [`db/README.md`](db/README.md).

## 9. Convenciones de código

- **Backend en 4 capas** por módulo de negocio, con nombres fijos:
  `<dominio>.routes.js` → `.controller.js` → `.service.js` → `.repository.js`.
  Solo el repository escribe SQL; solo `config/db.js` pide clientes del pool.
- **Frontend en MPA**, una carpeta por página con `index.html`, `main.js`,
  `pagina.js` y `api.js`. `api.js` es el único que conoce URLs `/api/*`.
- **`modules.js` es el registro único**: dar de alta una funcionalidad es una
  entrada ahí más las carpetas correspondientes, sin tocar `app.js`.
- **Contrato de respuesta único**: `{ success, message, data, timestamp }` en el
  éxito, `{ success, message, error, timestamp }` en el error.
- **SQL siempre parametrizado** (`$1`, `$2`, ...). Los únicos identificadores
  dinámicos provienen de listas blancas congeladas con `Object.freeze`.
- **Comentarios en español**, explicando el *porqué* y no el *qué*.

Detalle completo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 10. Equipo

| Integrante                     | Rol principal                                  | Horario habitual |
| ------------------------------ | ---------------------------------------------- | ---------------- |
| Jose Armando Figueredo Mancilla | Product Owner / Fullstack / QA                | Flexible, noches (20:00–23:00) |
| **Steven Joel Ramos Salazar**  | Product Owner / **DB Admin** / Backend / QA    | Flexible, tardes (16:00–20:00) |
| Joyce Angie Fernández Quispe   | Product Owner / Fullstack / QA                 | Flexible, tardes (17:00–18:00) |
| Camila Araoz Soliz             | Product Owner / Fullstack                      | Flexible, noches (21:00–23:00) |
| Wendy Puma Uribe               | Product Owner / Backend                        | Flexible, tardes (15:00–18:00) |
| Ximena Mendoza Humerez         | Product Owner / Frontend                       | Flexible, noches (21:00–23:00) |

Metodología: trabajo **asíncrono prioritario** con puntos de encuentro
sincrónicos obligatorios. Daily asíncrono antes de las 22:00 y sprint review los
jueves. Ver el contrato para los detalles.

## 11. Estado actual

El repositorio está en su commit inicial: contiene la estructura completa, el
contenedor, el esquema de la base de datos y la infraestructura compartida
(composición de Express, contrato de respuesta, traducción de errores, pool de
PostgreSQL y health check). **Todavía no hay módulos de negocio**: se entregan
en los siguientes increments, uno por Historia de Usuario.
