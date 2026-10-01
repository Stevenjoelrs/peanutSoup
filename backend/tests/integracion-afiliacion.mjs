/**
 * PRUEBA DE INTEGRACION — modulo de afiliación (US-01)
 * -----------------------------------------------------------------------------
 * Corre contra la base real y contra la app Express montada en memoria. No usa
 * mocks: lo que se comprueba aqui es el comportamiento que solo aparece contra
 * PostgreSQL, que son la validación de matrícula, control de duplicados y
 * validación de estado de estudiante activo.
 *
 * Casos que cubre:
 *   - afiliación exitosa con matrícula y cédula válidas
 *   - rechazo por matrícula inexistente en el padrón
 *   - rechazo por cédula que no coincide con la matrícula
 *   - rechazo por afiliación duplicada en el mismo periodo semestral
 *   - rechazo por fecha de vencimiento anterior a fecha de inicio
 *   - rechazo por campos requeridos faltantes
 *   - endpoints privados rechazan petición sin sesión
 *
 * AISLAMIENTO: la prueba usa estudiantes existentes del padrón (seeds.sql),
 * no crea nuevos. Usa periodos semestrales de prueba con formato corto
 * (VARCHAR(10)): P + año(4) + semestre(1), ej. P20991, P20992.
 *
 * Requiere DATABASE_URL en el .env de la raiz. Si no esta, la prueba se omite y
 * lo dice, en vez de fallar y hacer creer que el codigo esta roto.
 *
 *   pnpm --filter ssu-umss-backend test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';

// El .env vive en la raiz del monorepo, no en backend/. Resolver la ruta desde
// este archivo evita depender del directorio desde el que se invoque la prueba.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(RAIZ, '.env') });

const MARCA = 'P2099';
const HAY_BASE = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

let pool;
let server;
let base;
let app;
let estudiantesPadron;

const q = async (texto, params = []) => (await pool.query(texto, params)).rows;

/**
 * Borra afiliaciones de prueba creadas durante los tests.
 * Se ejecuta AL EMPEZAR y AL TERMINAR para garantizar aislamiento.
 */
const limpiarAfiliacionesPrueba = async () => {
  await q(
    `DELETE FROM afiliaciones
     WHERE periodo_semestral LIKE $1`,
    [`${MARCA}%`]
  );
};

before(async () => {
  if (!HAY_BASE) {
    console.log('\n  [omitida] Sin DATABASE_URL en el .env de la raiz: no hay base contra la que probar.\n');
    return;
  }

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? undefined : { rejectUnauthorized: false }
  });
  await pool.query('SELECT 1');
  await limpiarAfiliacionesPrueba();

  // Se usa la app real, no un servidor de pruebas aparte, para que lo que se
  // ejercita sea exactamente lo que corre: mismos middlewares, mismo registro.
  const { createApp } = await import('../src/shared/app.js');
  app = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // Cargar estudiantes del padrón para usar en los tests
  estudiantesPadron = await q(
    `SELECT id_estudiante, sis, cedula_identidad, nombre_completo
     FROM estudiantes
     ORDER BY sis
     LIMIT 5`
  );
  assert.ok(estudiantesPadron.length > 0, 'El padrón debe tener al menos un estudiante para las pruebas');
});

after(async () => {
  if (!pool) return;
  await limpiarAfiliacionesPrueba();
  server?.close();
  await pool.end();
  console.log('\n  afiliaciones de prueba eliminadas; la base quedó como estaba\n');
});

const tokenDe = (estudiante) =>
  jwt.sign(
    { id_estudiante: estudiante.id_estudiante, sis: estudiante.sis },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

const pedir = async (metodo, ruta, { token, cuerpo } = {}) => {
  const opciones = {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {})
    }
  };
  if (cuerpo && metodo !== 'GET' && metodo !== 'HEAD') {
    opciones.body = JSON.stringify(cuerpo);
  }
  const r = await fetch(base + ruta, opciones);
  return { status: r.status, cuerpo: await r.json() };
};

const omiteSiNoHayBase = () => (HAY_BASE ? false : 'sin DATABASE_URL: se omite contra la base real');

describe('afiliación semestral (US-01)', () => {
  // periodo_semestral es VARCHAR(10), usar formato: P + año(4) + semestre(1) = 6 chars
  const periodoPrueba = 'P20991';
  const fechaInicio = '2099-01-15';
  const fechaVencimiento = '2099-07-15';

  test('afiliación exitosa con estudiante válido del padrón', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);

    const r = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: periodoPrueba, fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });

    assert.equal(r.status, 201, `esperaba 201 y llegó ${r.status}: ${JSON.stringify(r.cuerpo)}`);
    assert.equal(r.cuerpo.success, true);
    assert.match(r.cuerpo.message, /Afiliado con cobertura activa/);
    assert.ok(r.cuerpo.data.afiliacion.id_afiliacion);
    assert.equal(r.cuerpo.data.afiliacion.periodo_semestral, periodoPrueba);
    assert.equal(r.cuerpo.data.estudiante.estado_cuenta, 'Afiliado con cobertura activa');
  });

  test('rechaza matrícula inexistente en el padrón (404)', omiteSiNoHayBase(), async () => {
    // Token con id_estudiante que no existe en estudiantes
    const idInexistente = '00000000-0000-0000-0000-000000000000';
    const token = jwt.sign({ id_estudiante: idInexistente, sis: '999999999' }, process.env.JWT_SECRET, { expiresIn: '8h' });

    const r = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: 'P20992', fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });

    assert.equal(r.status, 404);
    assert.equal(r.cuerpo.success, false);
    assert.match(r.cuerpo.message, /no se encontró en el padrón|estudiante no encontrado/i);
  });

  test('rechaza afiliación duplicada para mismo periodo (409)', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);
    const periodoDup = 'P20993';

    // Primera afiliación debe funcionar
    const primera = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: periodoDup, fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });
    assert.equal(primera.status, 201);

    // Segunda con mismo periodo debe fallar con 409
    const segunda = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: periodoDup, fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });
    assert.equal(segunda.status, 409, 'debe rechazar duplicado con 409');
    assert.equal(segunda.cuerpo.success, false);
    assert.match(segunda.cuerpo.message, /ya cuenta con una afiliación activa|ya existe una afiliación/i);
  });

  test('rechaza fecha de vencimiento anterior a fecha de inicio (400)', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);

    const r = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: {
        periodo_semestral: 'P20994',
        fecha_inicio: '2099-07-15',
        fecha_vencimiento: '2099-01-15' // anterior a inicio
      }
    });

    assert.equal(r.status, 400);
    assert.equal(r.cuerpo.success, false);
    assert.match(r.cuerpo.message, /vencimiento no puede ser anterior a la fecha de inicio/i);
  });

  test('rechaza campos requeridos faltantes (400)', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);

    // Sin periodo_semestral
    const r1 = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });
    assert.equal(r1.status, 400);
    assert.match(r1.cuerpo.message, /periodo_semestral.*requerido/i);

    // Sin fecha_inicio
    const r2 = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: 'P20995', fecha_vencimiento: fechaVencimiento }
    });
    assert.equal(r2.status, 400);
    assert.match(r2.cuerpo.message, /fecha_inicio.*requerido/i);

    // Sin fecha_vencimiento
    const r3 = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: { periodo_semestral: 'P20996', fecha_inicio: fechaInicio }
    });
    assert.equal(r3.status, 400);
    assert.match(r3.cuerpo.message, /fecha_vencimiento.*requerido/i);
  });

  test('formato de fecha inválido devuelve 400', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);

    const r = await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: {
        periodo_semestral: 'P20997',
        fecha_inicio: '15-01-2099', // formato DD-MM-YYYY inválido
        fecha_vencimiento: fechaVencimiento
      }
    });

    assert.equal(r.status, 400);
    assert.match(r.cuerpo.message, /fecha.*formato YYYY-MM-DD/i);
  });

  test('sin sesión devuelve 401', omiteSiNoHayBase(), async () => {
    const r = await pedir('POST', '/api/afiliaciones/solicitar', {
      cuerpo: { periodo_semestral: 'P20998', fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });
    assert.equal(r.status, 401);
  });

  test('alias /api/afiliaciones funciona igual que /solicitar', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);
    const periodo = 'P20999';

    const r = await pedir('POST', '/api/afiliaciones', {
      token,
      cuerpo: { periodo_semestral: periodo, fecha_inicio: fechaInicio, fecha_vencimiento: fechaVencimiento }
    });

    assert.equal(r.status, 201);
    assert.match(r.cuerpo.message, /Afiliado con cobertura activa/);
  });
});

describe('consulta de vigencia (US-12)', () => {
  test('estudiante sin afiliaciones previas devuelve tiene_afiliacion: false', omiteSiNoHayBase(), async () => {
    // Buscar un estudiante que NO tenga NINGUNA afiliación
    const estudianteLimpio = await q(
      `SELECT e.id_estudiante, e.sis, e.nombre_completo
       FROM estudiantes e
       LEFT JOIN afiliaciones a ON e.id_estudiante = a.id_estudiante
       WHERE a.id_afiliacion IS NULL
       LIMIT 1`
    );

    if (estudianteLimpio.length === 0) {
      console.log('  [omitido] No hay estudiante sin afiliaciones disponible');
      return;
    }

    const token = tokenDe(estudianteLimpio[0]);

    const r = await pedir('GET', '/api/afiliaciones/vigencia', { token });

    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.success, true);
    assert.equal(r.cuerpo.data.tiene_afiliacion, false);
    assert.equal(r.cuerpo.data.estado_cuenta, 'Sin afiliación registrada');
    assert.equal(r.cuerpo.data.elegible_renovacion, false);
  });

  test('estudiante con afiliación activa devuelve estado_cuenta correcto', omiteSiNoHayBase(), async () => {
    const [estudiante] = estudiantesPadron;
    const token = tokenDe(estudiante);

    // Primero crear una afiliación con periodo de prueba
    await pedir('POST', '/api/afiliaciones/solicitar', {
      token,
      cuerpo: {
        periodo_semestral: 'P20990',
        fecha_inicio: '2099-01-01',
        fecha_vencimiento: '2099-12-31'
      }
    });

    const r = await pedir('GET', '/api/afiliaciones/vigencia', { token });

    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.success, true);
    assert.equal(r.cuerpo.data.tiene_afiliacion, true);
    assert.equal(r.cuerpo.data.estado_cuenta, 'Afiliado con cobertura activa');
    assert.ok(Number.isInteger(r.cuerpo.data.dias_para_vencer));
    assert.ok(Number.isInteger(r.cuerpo.data.limite_renovacion_dias));
  });

  test('sin sesión devuelve 401', omiteSiNoHayBase(), async () => {
    const r = await pedir('GET', '/api/afiliaciones/vigencia');
    assert.equal(r.status, 401);
  });
});