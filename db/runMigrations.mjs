#!/usr/bin/env node
/**
 * SSU - UMSS | Corredor de migraciones
 * -----------------------------------------------------------------------------
 * Lee `db/migrations/*.sql` en orden alfabetico y los ejecuta uno a uno sobre la
 * instancia unica de Supabase Cloud. Con `--seed` ejecuta ademas `db/seeds.sql`.
 *
 *   pnpm migrate        aplica el esquema
 *   pnpm seed           aplica el esquema y carga datos de prueba
 *
 * Reglas del equipo (contrato, seccion 4):
 *   - Prohibido alterar el esquema desde la interfaz grafica de Supabase.
 *   - Todo cambio estructural va en un archivo nuevo de `db/migrations/`.
 *   - Solo el DB Admin ejecuta las migraciones finales en la nube.
 *
 * Decisiones de diseno:
 *   - Cada archivo .sql es IDEMPOTENTE. Por eso no hay tabla de control de
 *     migraciones: correr el corredor dos veces no rompe nada y se puede
 *     recuperar de una ejecucion interrumpida sin estado que reparar.
 *   - No se importan dependencias de `backend/`. Este paquete es autonomo para
 *     que el DB Admin pueda migrar la base sin levantar la API.
 * =============================================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

/**
 * Vocabularios de estado que la aplicacion usa en el codigo.
 * Se reimprimen al final de cada corrida para compararlos con los CHECK que
 * realmente creo la base de datos: si divergen, la tabla quedo inservible.
 */
const ESTADOS = {
  afiliaciones: ['ACTIVA', 'INACTIVA'],
  fichas_reservadas: ['RESERVADA', 'CONFIRMADA', 'CANCELADA_USUARIO', 'ASISTIO'],
  tipo_ficha: ['GENERAL', 'INCLUSIVA', 'ESPECIALISTA'],
  ordenes_derivacion: ['ACTIVA', 'UTILIZADA'],
  ordenes_laboratorio: ['Solicitado', 'En curso', 'Aceptado', 'Terminado']
};

const TABLAS_CON_ESTADO = [
  'afiliaciones',
  'fichas_reservadas',
  'ordenes_derivacion',
  'ordenes_laboratorio'
];

/**
 * Pool propio del corredor. Misma logica que `backend/src/shared/config/db.js`
 * pero aislada: migrar la base no debe exigir el codigo de la API.
 */
const crearPool = () => {
  const config = {};

  if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
    if (
      process.env.DATABASE_URL.includes('supabase.co') ||
      process.env.DATABASE_URL.includes('sslmode=require') ||
      process.env.PGSSL === 'true'
    ) {
      config.ssl = { rejectUnauthorized: false };
    }
  } else {
    config.host = process.env.PGHOST || 'localhost';
    config.port = parseInt(process.env.PGPORT || '5432', 10);
    config.user = process.env.PGUSER || 'postgres';
    config.password = process.env.PGPASSWORD || 'postgres';
    config.database = process.env.PGDATABASE || 'postgres';
    if (process.env.PGSSL === 'true') {
      config.ssl = { rejectUnauthorized: false };
    }
  }

  config.max = 2;
  config.connectionTimeoutMillis = 10000;
  return new Pool(config);
};

const listarMigraciones = () => {
  const carpeta = path.join(__dirname, 'migrations');
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();
};

async function run() {
  const conSemillas = process.argv.includes('--seed');

  console.log('====================================================');
  console.log(' SSU - UMSS :: migraciones de base de datos');
  console.log('====================================================');

  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.error('✖ Falta la configuracion de conexion.');
    console.error('  Copia .env.example a .env y completa DATABASE_URL con Supabase.');
    process.exit(1);
  }

  const pool = crearPool();
  const client = await pool.connect();

  try {
    const migraciones = listarMigraciones();
    if (migraciones.length === 0) {
      console.warn('⚠ db/migrations/ está vacío o no existe: no hay nada que aplicar.');
    }

    for (const archivo of migraciones) {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', archivo), 'utf8');
      console.log(`[INFO] Ejecutando ${archivo} ...`);
      await client.query(sql);
      console.log(`  ✔ ${archivo}`);
    }

    if (conSemillas) {
      const archivoSemillas = path.join(__dirname, 'seeds.sql');
      if (fs.existsSync(archivoSemillas)) {
        console.log('[INFO] Cargando db/seeds.sql ...');
        await client.query(fs.readFileSync(archivoSemillas, 'utf8'));
        console.log('  ✔ datos de prueba cargados');
      } else {
        console.warn('⚠ No existe db/seeds.sql: se omite la carga de datos de prueba.');
      }
    }

    const checks = await client.query(
      `SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE contype = 'c' AND conrelid::regclass::text = ANY($1)
        ORDER BY 1, 2`,
      [TABLAS_CON_ESTADO]
    );

    console.log('\n[INFO] Restricciones CHECK de estado vigentes en la base de datos:');
    if (checks.rows.length === 0) {
      console.log('  (ninguna)');
    }
    for (const c of checks.rows) {
      console.log(`  ${c.tabla}.${c.conname} -> ${c.def}`);
    }

    console.log('\n[INFO] Vocabularios que usa la aplicacion:');
    for (const [tabla, valores] of Object.entries(ESTADOS)) {
      console.log(`  ${tabla}: ${valores.join(' | ')}`);
    }
  } catch (error) {
    console.error('✖ Error ejecutando migraciones:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n✔ Conexion cerrada.');
}

run();
