# db/ — Esquema, migraciones y semillas

Paquete independiente del monorepo. Contiene **todo** lo que define o llena la
base de datos y nada de la aplicación. Su unico requisito es `DATABASE_URL`.

```
db/
├── package.json        # workspace ssu-umss-db (pg + dotenv, sin framework)
├── runMigrations.mjs   # corredor: aplica migrations/*.sql en orden y opcionalmente seeds.sql
├── seeds.sql           # datos de prueba (TRUNCATE + inserciones)
└── migrations/
    └── NNN_nombre.sql  # un archivo por cambio estructural, en orden de aplicación
```

`migrations/` y `seeds.sql` se llenan de forma incremental: cada commit que
cambia el esquema agrega **un** archivo nuevo. El directorio empieza vacío a
propósito, para que el historial de la base de datos se lea igual que el historial
de `git log`.

## Comandos

Desde la raíz del repositorio:

```bash
pnpm migrate   # aplica las migraciones pendientes
pnpm seed      # aplica las migraciones y carga los datos de prueba
```

O bien, dentro de un contenedor, sin instalar nada en el host:

```bash
docker compose run --rm app pnpm migrate
docker compose run --rm app pnpm seed
```

## Reglas obligatorias del equipo

1. **La base de datos es una única instancia en la nube** (Supabase Cloud,
   PostgreSQL 16) compartida por los 6 integrantes. No hay base de datos local y
   ningún servicio de base de datos en `docker-compose.yml`.
2. **`.env` nunca se sube al repositorio.** Cada integrante tiene el suyo.
3. **Ningún cambio estructural se hace desde la interfaz gráfica de Supabase.**
   Si se necesita una columna, una restricción o una tabla, se escribe un
   archivo `.sql` nuevo en `db/migrations/`.
4. **Solo el DB Admin ejecuta las migraciones finales en la nube.** Los demás
   aportan el archivo, avisan en el canal y esperan la confirmación.

## Cómo se numera una migración

- El prefijo es un entero de tres dígitos con guion bajo y guion: `NNN_nombre.sql`.
- El nombre describe la tabla o la intención, en minúsculas y con guiones bajos.
- **Nunca se edita una migración que ya se ejecutó en Supabase.** Se agrega otra.
- Cada archivo debe ser **idempotente**: `CREATE TABLE IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`, `DROP ... IF EXISTS`, `ADD COLUMN IF NOT EXISTS`.
  El corredor no lleva una tabla de control justamente para que volver a correr
  todo sea seguro tras una ejecución interrumpida.

## Vocabularios de estado

Son el contrato de datos más frágil del sistema: un `CHECK` que no coincide con
lo que la aplicación inserta deja la tabla inservible aunque el `INSERT` use el
valor por defecto. Por eso `runMigrations.mjs` reimprime al final los `CHECK`
que quedaron en la base y los vocabularios que usa el código, para compararlos.

| Tabla                | Valores admitidos                                |
| -------------------- | ------------------------------------------------ |
| `afiliaciones`       | `ACTIVA` \| `INACTIVA`                           |
| `fichas_reservadas`  | `RESERVADA` \| `CONFIRMADA` \| `CANCELADA_USUARIO` \| `ASISTIO` |
| `fichas_reservadas`  | `GENERAL` \| `INCLUSIVA` \| `ESPECIALISTA` (tipo_ficha) |
| `ordenes_derivacion` | `ACTIVA` \| `UTILIZADA`                          |
| `ordenes_laboratorio`| `EMITIDA` \| `EN_CURSO` \| `FINALIZADA`          |
