import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * Pool de conexiones PostgreSQL nativo (sin ORM), el unico del backend.
 * -----------------------------------------------------------------------------
 * El equipo trabaja contra UNA instancia en la nube (Supabase Cloud, PostgreSQL
 * 16) compartida por los 6 integrantes, de modo que la conexion siempre es
 * remota y cifrada: no hay postgres dentro de docker-compose.yml.
 *
 * Se lee DATABASE_URL y, si no existe, se arma la conexión con las variables
 * individuales PG*. Supabase exige SSL, asi que se activa automaticamente cuando
 * la URL es de supabase.co o cuando PGSSL=true.
 */
const poolConfig = {};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  if (
    process.env.DATABASE_URL.includes('supabase.co') ||
    process.env.DATABASE_URL.includes('sslmode=require') ||
    process.env.PGSSL === 'true' ||
    process.env.NODE_ENV === 'production'
  ) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.port = parseInt(process.env.PGPORT || '5432', 10);
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || 'postgres';
  poolConfig.database = process.env.PGDATABASE || 'postgres';

  if (process.env.PGSSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

// Parámetros de optimización del pool
poolConfig.max = parseInt(process.env.PG_POOL_MAX || '20', 10);
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 5000;

export const pool = new Pool(poolConfig);

/**
 * Cada integrante tiene su propio `.env`, así que es normal olvidar copiarlo.
 * Avisarlo al arrancar es mejor que dejar que `pg` intente conectarse a
 * localhost:5432 y devuelva un error sin contexto.
 */
if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.warn(
    '[db] Sin DATABASE_URL ni PGHOST: se intentará conectar a localhost:5432. ' +
      'Copia .env.example a .env y pega tus credenciales de Supabase.'
  );
}

pool.on('error', (err) => {
  console.error('[DATABASE POOL ERROR]: fallo inesperado en cliente inactivo', err.message);
});

/**
 * Ejecutar una consulta directa en SQL nativo, siempre parametrizada.
 * @param {string} text Sentencia SQL con marcadores $1, $2, ...
 * @param {Array} params Valores de los marcadores
 * @returns {Promise<import('pg').QueryResult>}
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Ejecuta `operacion` dentro de una transacción atómica (BEGIN / COMMIT / ROLLBACK).
 *
 * Es la única forma sancionada de obtener un cliente: un repositorio que necesite
 * un INSERT con verificación previa (afiliación, perfil, registro) usa esta
 * función en vez de pedir el cliente por su cuenta, para que el COMMIT y el
 * ROLLBACK queden escritos en un solo sitio.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} operacion
 * @returns {Promise<any>} lo que devuelva la operación
 */
export const conTransaccion = async (operacion) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const valor = await operacion(client);
    await client.query('COMMIT');
    return valor;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Comprobar el estado de la conexión sin lanzar excepciones: la usa el health
 * check, que debe responder 503 y no reventar el proceso.
 */
export const checkHealth = async () => {
  try {
    const start = Date.now();
    const res = await pool.query('SELECT NOW() as now, version() as version;');
    return {
      connected: true,
      durationMs: Date.now() - start,
      serverTime: res.rows[0].now,
      version: res.rows[0].version
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
};

export default { pool, query, conTransaccion, checkHealth };
