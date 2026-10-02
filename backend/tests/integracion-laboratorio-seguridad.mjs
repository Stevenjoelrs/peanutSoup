/**
 * PRUEBAS DE SEGURIDAD QA — acceso a informes de laboratorio (US-13)
 * -----------------------------------------------------------------------------
 * Verifica que el endpoint /api/laboratorio/ordenes/{id}/descargar-informe
 * impida accesos indebidos por manipulación de ID en la URL.
 *
 * Casos que cubre:
 *   - Dueño puede descargar su informe en estado "Terminado"
 *   - Estudiante ajeno recibe 404 (no 403, para no filtrar existencia)
 *   - Estado no "Terminado" devuelve 400
 *   - UUID inexistente devuelve 404
 *   - Sin sesión devuelve 401
 *   - Enumeración de IDs no revela información de otros estudiantes
 *   - ID malformado devuelve 400/404
 *   - Lista de órdenes solo muestra las del estudiante autenticado
 *
 * Requiere DATABASE_URL. Si no está, se omite.
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

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(RAIZ, '.env') });

const MARCA = 'PRUEBA-LAB-SEGURIDAD';
const HAY_BASE = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

let pool;
let server;
let base;
let app;
let idMedico;
let estudiantes;

const q = async (texto, params = []) => (await pool.query(texto, params)).rows;

const limpiarFixtures = async () => {
  await q('DELETE FROM ordenes_laboratorio WHERE id_medico = $1', [idMedico]);
  await q('DELETE FROM medicos WHERE nombre_completo LIKE $1', [`${MARCA}%`]);
};

before(async () => {
  if (!HAY_BASE) {
    console.log('\n  [omitida] Sin DATABASE_URL: no hay base para pruebas de seguridad.\n');
    return;
  }

  // `node --test` lanza los cuatro archivos de pruebas en paralelo y cada uno abre
  // su app (y su pool) contra la misma base de Supabase. En modo sesion el tope
  // es de 15 conexiones por proyecto y unas 10 ya las ocupan los servicios
  // internos, asi que el PG_POOL_MAX=20 del .env no cabe. El presupuesto se
  // reparte de forma explicita entre archivos en lugar de heredar el del .env.
  process.env.PG_POOL_MAX = process.env.PG_POOL_MAX_TEST || '3';
  process.env.PG_CONNECT_TIMEOUT_MS = process.env.PG_CONNECT_TIMEOUT_MS || '60000';

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? undefined : { rejectUnauthorized: false },
    max: 1
  });
  await pool.query('SELECT 1');
  await limpiarFixtures();

  const { createApp } = await import('../src/shared/app.js');
  app = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const med = await q(
    `INSERT INTO medicos (nombre_completo, es_especialista) VALUES ($1, FALSE) RETURNING id_medico`,
    [`${MARCA} - Dr. Lab Seguridad`]
  );
  idMedico = med[0].id_medico;

  estudiantes = await q(
    `SELECT id_estudiante, sis, nombre_completo FROM estudiantes ORDER BY sis LIMIT 5`
  );
  assert.ok(estudiantes.length >= 2, 'Se necesitan al menos 2 estudiantes para pruebas de seguridad');
});

after(async () => {
  if (!pool) return;
  await limpiarFixtures();
  server?.close();
  await pool.end();
  console.log('\n  fixtures de seguridad eliminados; base limpia\n');
});

const tokenDe = (e) =>
  jwt.sign({ id_estudiante: e.id_estudiante, sis: e.sis }, process.env.JWT_SECRET, { expiresIn: '8h' });

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

const omiteSiNoHayBase = () => (HAY_BASE ? false : 'sin DATABASE_URL: se omite seguridad');

const crearOrden = async (idEstudiante, estado = 'Terminado', urlInforme = 'https://httpbin.org/bytes/100') => {
  const result = await q(
    `INSERT INTO ordenes_laboratorio (id_estudiante, id_medico, tipo_laboratorio, estado, url_informe_resultado)
     VALUES ($1, $2, 'Hemograma', $3, $4) RETURNING id_orden_lab`,
    [idEstudiante, idMedico, estado, urlInforme]
  );
  return result[0].id_orden_lab;
};

const limpiarTest = async (ids) => {
  if (ids.length > 0) {
    await q('DELETE FROM ordenes_laboratorio WHERE id_orden_lab = ANY($1)', [ids]);
  }
};

describe('seguridad: acceso a informes de laboratorio (US-13)', () => {
  test('dueño con estado Terminado puede descargar su informe', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idOrden = await crearOrden(e1.id_estudiante, 'Terminado');
    const token = tokenDe(e1);

    const r = await pedir('GET', `/api/laboratorio/ordenes/${idOrden}/descargar-informe`, { token });

    assert.equal(r.status, 200, `esperaba 200, llegó ${r.status}: ${JSON.stringify(r.cuerpo)}`);
    assert.equal(r.cuerpo.success, true);
    assert.ok(r.cuerpo.data.enlaceInforme);
    assert.match(r.cuerpo.data.enlaceInforme, /^https?:\/\//);

    await limpiarTest([idOrden]);
  });

  test('estudiante ajeno recibe 404 (no 403) para no filtrar existencia', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;
    const idOrden = await crearOrden(e1.id_estudiante, 'Terminado');
    const token = tokenDe(e2);

    const r = await pedir('GET', `/api/laboratorio/ordenes/${idOrden}/descargar-informe`, { token });

    assert.equal(r.status, 404, `estudiante ajeno debe recibir 404, llegó ${r.status}`);
    assert.equal(r.cuerpo.success, false);
    assert.match(r.cuerpo.message, /no encontrada|no pertenece/i);

    await limpiarTest([idOrden]);
  });

  test('estado no Terminado devuelve 400', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const estados = ['Solicitado', 'En curso', 'Aceptado'];
    const ids = [];

    for (const estado of estados) {
      const idOrden = await crearOrden(e1.id_estudiante, estado);
      ids.push(idOrden);
      const token = tokenDe(e1);

      const r = await pedir('GET', `/api/laboratorio/ordenes/${idOrden}/descargar-informe`, { token });

      assert.equal(r.status, 400, `estado ${estado} debe devolver 400`);
      assert.equal(r.cuerpo.success, false);
      assert.match(r.cuerpo.message, /no está disponible|no está listo/i);
    }
    await limpiarTest(ids);
  });

  test('orden sin URL de informe devuelve 404', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idOrden = await crearOrden(e1.id_estudiante, 'Terminado', null);
    const token = tokenDe(e1);

    const r = await pedir('GET', `/api/laboratorio/ordenes/${idOrden}/descargar-informe`, { token });

    assert.equal(r.status, 404);
    assert.equal(r.cuerpo.success, false);
    assert.match(r.cuerpo.message, /no tiene un informe asociado/i);

    await limpiarTest([idOrden]);
  });

  test('UUID inexistente devuelve 404', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const token = tokenDe(e1);
    const uuidInexistente = '00000000-0000-0000-0000-000000000000';

    const r = await pedir('GET', `/api/laboratorio/ordenes/${uuidInexistente}/descargar-informe`, { token });

    assert.equal(r.status, 404);
    assert.equal(r.cuerpo.success, false);
  });

  test('ID malformado (no UUID) devuelve 400 o 404', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const token = tokenDe(e1);

    const r = await pedir('GET', `/api/laboratorio/ordenes/no-es-un-uuid/descargar-informe`, { token });

    assert.ok([400, 404].includes(r.status), `esperaba 400 o 404, llegó ${r.status}`);
  });

  test('sin sesión devuelve 401', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idOrden = await crearOrden(e1.id_estudiante, 'Terminado');

    const r = await pedir('GET', `/api/laboratorio/ordenes/${idOrden}/descargar-informe`);

    assert.equal(r.status, 401);

    await limpiarTest([idOrden]);
  });

  test('enumeración de IDs no revela información de otros estudiantes', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;

    // e1 crea 3 órdenes en estado Terminado
    const idsE1 = await Promise.all([
      crearOrden(e1.id_estudiante, 'Terminado'),
      crearOrden(e1.id_estudiante, 'Terminado'),
      crearOrden(e1.id_estudiante, 'Terminado')
    ]);

    // e2 crea 2 órdenes
    const idsE2 = await Promise.all([
      crearOrden(e2.id_estudiante, 'Terminado'),
      crearOrden(e2.id_estudiante, 'Terminado')
    ]);

    const todosIds = [...idsE1, ...idsE2];

    const tokenE1 = tokenDe(e1);
    const tokenE2 = tokenDe(e2);

    // e1 intenta acceder a sus propias órdenes -> todas 200
    for (const id of idsE1) {
      const r = await pedir('GET', `/api/laboratorio/ordenes/${id}/descargar-informe`, { token: tokenE1 });
      assert.equal(r.status, 200, `e1 debe acceder a su orden ${id}`);
    }

    // e1 intenta acceder a órdenes de e2 -> todas 404
    for (const id of idsE2) {
      const r = await pedir('GET', `/api/laboratorio/ordenes/${id}/descargar-informe`, { token: tokenE1 });
      assert.equal(r.status, 404, `e1 NO debe acceder a orden de e2 (${id})`);
    }

    // e2 intenta acceder a sus propias órdenes -> todas 200
    for (const id of idsE2) {
      const r = await pedir('GET', `/api/laboratorio/ordenes/${id}/descargar-informe`, { token: tokenE2 });
      assert.equal(r.status, 200, `e2 debe acceder a su orden ${id}`);
    }

    // e2 intenta acceder a órdenes de e1 -> todas 404
    for (const id of idsE1) {
      const r = await pedir('GET', `/api/laboratorio/ordenes/${id}/descargar-informe`, { token: tokenE2 });
      assert.equal(r.status, 404, `e2 NO debe acceder a orden de e1 (${id})`);
    }

    await limpiarTest(todosIds);
  });

  test('lista de órdenes solo muestra las del estudiante autenticado', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;

    await crearOrden(e1.id_estudiante, 'Terminado');
    await crearOrden(e1.id_estudiante, 'En curso');
    await crearOrden(e2.id_estudiante, 'Terminado');

    const r1 = await pedir('GET', '/api/laboratorio/ordenes', { token: tokenDe(e1) });
    const r2 = await pedir('GET', '/api/laboratorio/ordenes', { token: tokenDe(e2) });

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    // Filtrar solo las de prueba (las que tienen id_medico de prueba)
    const ordenesE1 = r1.cuerpo.data.filter(o => o.medico_solicitante?.startsWith(`${MARCA} `));
    const ordenesE2 = r2.cuerpo.data.filter(o => o.medico_solicitante?.startsWith(`${MARCA} `));
    assert.equal(ordenesE1.length, 2, 'e1 debe ver solo sus 2 órdenes de prueba');
    assert.equal(ordenesE2.length, 1, 'e2 debe ver solo su 1 orden de prueba');
    assert.ok(ordenesE1.every((o) => o.id_estudiante === e1.id_estudiante));
    assert.ok(ordenesE2.every((o) => o.id_estudiante === e2.id_estudiante));
  });
});