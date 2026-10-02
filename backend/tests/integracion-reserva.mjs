/**
 * PRUEBA DE INTEGRACION — modulo de reservas (US-03, US-08)
 * -----------------------------------------------------------------------------
 * Corre contra la base real y contra la app Express montada en memoria. No usa
 * mocks: lo que se comprueba aqui es el comportamiento que solo aparece contra
 * PostgreSQL, que son el bloqueo pesimistico de filas, las transacciones y la
 * regla de una ficha por estudiante y dia.
 *
 * Casos que cubre:
 *   - dos estudiantes pidiendo el mismo horario a la vez (doble booking)
 *   - un horario ya consumido se rechaza
 *   - una sola ficha por estudiante y dia
 *   - recorrido completo de la reserva con especialista
 *   - la orden de derivacion se consume y no sirve por segunda vez
 *   - una derivacion ajena no se puede usar
 *   - un medico de medicina general no acepta ficha de especialista
 *   - los endpoints privados rechazan la peticion sin sesion
 *
 * AISLAMIENTO: la prueba crea su propio medico, especialidad, horarios y
 * derivaciones, con nombres marcados como PRUEBA y fechas lejanas, y lo borra
 * al terminar. No reserva ningun turno real del equipo ni altera el padron.
 * Cada caso usa una fecha distinta a proposito: la regla de una ficha por dia
 * es real, y compartir fecha entre casos haria que uno falseara a otro.
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

const MARCA = 'PRUEBA-AUTOMATICA';
const HAY_BASE = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

let pool;
let server;
let base;
let app;
let idMedicoGeneral;
let idMedicoEspecialista;
let idEspecialidad;
let estudiantes;

const q = async (texto, params = []) => (await pool.query(texto, params)).rows;

/**
 * Borra los fixtures de la prueba. Se ejecuta AL EMPEZAR y AL TERMINAR.
 *
 * Empezar tambien es importante: si una corrida anterior se corto a la mitad, o
 * el proceso murio, los fixtures quedan en la base y la siguiente falla con un
 * error de clave duplicada que no dice nada del código. Con esta limpieza la
 * prueba se autorepara.
 */
const limpiarFixtures = async () => {
  await q('DELETE FROM fichas_reservadas WHERE id_horario IN (SELECT id_horario FROM horarios_atencion WHERE consultorio = $1)', ['PRUEBA']);
  await q('DELETE FROM ordenes_derivacion WHERE id_medico_emisor IN (SELECT id_medico FROM medicos WHERE nombre_completo LIKE $1)', [`${MARCA}%`]);
  await q('DELETE FROM horarios_atencion WHERE consultorio = $1', ['PRUEBA']);
  await q('DELETE FROM medicos WHERE nombre_completo LIKE $1', [`${MARCA}%`]);
  await q('DELETE FROM especialidades WHERE nombre LIKE $1', [`${MARCA}%`]);
  await q(`DELETE FROM afiliaciones WHERE periodo_semestral LIKE 'PRUEBA%'`);
  await q(`DELETE FROM estudiantes WHERE sis LIKE 'PRUEBA-%'`);
};

before(async () => {
  if (!HAY_BASE) {
    console.log('\n  [omitida] Sin DATABASE_URL en el .env de la raiz: no hay base contra la que probar.\n');
    return;
  }

  // `node --test` lanza este archivo en paralelo con los otros tres de pruebas,
  // y cada uno abre su propia app contra la misma base de Supabase. Supabase en
  // modo sesion limita a 15 conexiones por proyecto, y unas 10 ya las ocupan sus
  // servicios internos, asi que el .env con PG_POOL_MAX=20 no cabe. Se reparte el
  // presupuesto de forma explicita: 2 para la app de este archivo + 1 aqui, y el
  // resto entre el de estres y el de laboratorio. Este archivo hace pocas
  // peticiones simultaneas, asi que no necesita mas.
  process.env.PG_POOL_MAX = process.env.PG_POOL_MAX_TEST || '2';

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? undefined : { rejectUnauthorized: false },
    max: 1
  });
  await pool.query('SELECT 1');
  await limpiarFixtures();

  // Se usa la app real, no un servidor de pruebas aparte, para que lo que se
  // ejercita sea exactamente lo que corre: mismos middlewares, mismo registro.
  const { createApp } = await import('../src/shared/app.js');
  app = createApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const esp = await q(
    `INSERT INTO especialidades (nombre, descripcion) VALUES ($1, $2) RETURNING id_especialidad`,
    [`${MARCA} - Odontologia`, 'Especialidad creada por la prueba de integracion']
  );
  idEspecialidad = esp[0].id_especialidad;

  const gral = await q(
    `INSERT INTO medicos (nombre_completo, es_especialista) VALUES ($1, FALSE) RETURNING id_medico`,
    [`${MARCA} - Medico General`]
  );
  idMedicoGeneral = gral[0].id_medico;

  const espMed = await q(
    `INSERT INTO medicos (nombre_completo, es_especialista, id_especialidad)
     VALUES ($1, TRUE, $2) RETURNING id_medico`,
    [`${MARCA} - Medico Especialista`, idEspecialidad]
  );
  idMedicoEspecialista = espMed[0].id_medico;

  // Las reservas exigen afiliación vigente. Se usan
  // estudiantes dedicados con cobertura de prueba en vez del padrón: así la
  // prueba no depende del estado real de la base ni choca con la exclusión
  // `no_solapar_afiliaciones_activas` de Supabase. limpiarFixtures los borra
  // (CASCADE arrastra sus afiliaciones).
  estudiantes = [];
  for (const sufijo of ['RES1', 'RES2']) {
    const r = await q(
      `INSERT INTO estudiantes (sis, cedula_identidad, nombre_completo, facultad, carrera)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_estudiante, sis, nombre_completo`,
      [`PRUEBA-${sufijo}`, `PRUEBA-CI-${sufijo}`, `${MARCA} Estudiante ${sufijo}`, 'Medicina', 'Medicina']
    );
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA', CURRENT_DATE - 10, CURRENT_DATE + 100, 'ACTIVA')`,
      [r[0].id_estudiante]
    );
    estudiantes.push(r[0]);
  }
});

after(async () => {
  if (!pool) return;
  await limpiarFixtures();
  server?.close();
  await pool.end();
  console.log('\n  fixtures de prueba eliminados; la base quedo como estaba\n');
});

/** Horario nuevo y aislado, registrado para la limpieza. */
const crearHorario = async (idMedico, fecha, hora = '08:00') => {
  const h = await q(
    `INSERT INTO horarios_atencion (id_medico, fecha, hora_inicio, hora_fin, consultorio)
     VALUES ($1, $2, $3, $4, 'PRUEBA') RETURNING id_horario`,
    [idMedico, fecha, hora, '08:30']
  );
  return h[0].id_horario;
};

/** Derivacion ACTIVA de prueba para un estudiante. */
const crearDerivacion = async (idEstudiante) => {
  const d = await q(
    `INSERT INTO ordenes_derivacion (id_estudiante, id_medico_emisor, estado, id_especialidad_requerida)
     VALUES ($1, $2, 'ACTIVA', $3) RETURNING id_derivacion`,
    [idEstudiante, idMedicoGeneral, idEspecialidad]
  );
  return d[0].id_derivacion;
};

/** Estudiante de prueba sin cobertura (lo borra limpiarFixtures por sis PRUEBA-). */
const crearEstudianteSinCobertura = async (sufijo) => {
  const r = await q(
    `INSERT INTO estudiantes (sis, cedula_identidad, nombre_completo, facultad, carrera)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_estudiante, sis, nombre_completo`,
    [`PRUEBA-${sufijo}`, `PRUEBA-CI-${sufijo}`, `${MARCA} Estudiante ${sufijo}`, 'Medicina', 'Medicina']
  );
  return r[0];
};

const tokenDe = (e) =>
  jwt.sign({ id_estudiante: e.id_estudiante, sis: e.sis }, process.env.JWT_SECRET, { expiresIn: '8h' });

const pedir = async (metodo, ruta, { token, cuerpo } = {}) => {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo ?? {})
  });
  return { status: r.status, cuerpo: await r.json() };
};

const omiteSiNoHayBase = () => (HAY_BASE ? false : 'sin DATABASE_URL: se omite contra la base real');

describe('reserva de ficha médica general (US-03)', () => {
  test('dos estudiantes al mismo tiempo: uno reserva y el otro recibe 409', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;
    const horario = await crearHorario(idMedicoGeneral, '2099-12-01');

    const [r1, r2] = await Promise.all([
      pedir('POST', '/api/fichas/reservar', { token: tokenDe(e1), cuerpo: { id_horario: horario } }),
      pedir('POST', '/api/fichas/reservar', { token: tokenDe(e2), cuerpo: { id_horario: horario } })
    ]);

    assert.deepEqual(
      [r1.status, r2.status].sort((a, b) => a - b),
      [201, 409],
      'una reserva debe ganar y la otra recibir 409'
    );

    const fichas = await q('SELECT id_ficha FROM fichas_reservadas WHERE id_horario = $1', [horario]);
    assert.equal(fichas.length, 1, 'no puede existir mas de una ficha por horario');

    const { disponible } = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(disponible, false, 'el horario debe quedar consumido');
  });

  test('un horario ya reservado se rechaza con 409', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;
    const horario = await crearHorario(idMedicoGeneral, '2099-12-02');

    const primera = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: horario }
    });
    assert.equal(primera.status, 201);

    const segunda = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e2),
      cuerpo: { id_horario: horario }
    });
    assert.equal(segunda.status, 409, 'otro estudiante no puede tomar un horario ya reservado');
  });

  test('un mismo estudiante no puede tener dos fichas el mismo dia', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const fecha = '2099-12-03';
    const uno = await crearHorario(idMedicoGeneral, fecha, '08:00');
    const dos = await crearHorario(idMedicoGeneral, fecha, '10:00');

    const primera = await pedir('POST', '/api/fichas/reservar', { token: tokenDe(e1), cuerpo: { id_horario: uno } });
    assert.equal(primera.status, 201);

    const segunda = await pedir('POST', '/api/fichas/reservar', { token: tokenDe(e1), cuerpo: { id_horario: dos } });
    assert.equal(segunda.status, 409, 'la regla de una ficha por estudiante y dia debe cumplirse');
    assert.match(segunda.cuerpo.message, /No se permiten dos fichas el mismo día|solo se permite una ficha/i);
  });

  test('el mismo estudiante pidiendo dos horarios del mismo dia a la vez: solo uno gana', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const fecha = '2099-12-05';
    const uno = await crearHorario(idMedicoGeneral, fecha, '08:00');
    const dos = await crearHorario(idMedicoGeneral, fecha, '10:00');
    const token = tokenDe(e1);

    const [r1, r2] = await Promise.all([
      pedir('POST', '/api/fichas/reservar', { token, cuerpo: { id_horario: uno } }),
      pedir('POST', '/api/fichas/reservar', { token, cuerpo: { id_horario: dos } })
    ]);

    assert.deepEqual(
      [r1.status, r2.status].sort((a, b) => a - b),
      [201, 409],
      'dos peticiones simultaneas no pueden saltarse la regla de una ficha por dia'
    );

    const fichas = await q(
      `SELECT f.id_ficha FROM fichas_reservadas f
       JOIN horarios_atencion h ON f.id_horario = h.id_horario
       WHERE f.id_estudiante = $1 AND h.fecha = $2`,
      [e1.id_estudiante, fecha]
    );
    assert.equal(fichas.length, 1, 'el estudiante debe quedar con una sola ficha ese dia');

    const libres = await q(
      'SELECT id_horario FROM horarios_atencion WHERE id_horario = ANY($1) AND disponible = TRUE',
      [[uno, dos]]
    );
    assert.equal(libres.length, 1, 'el horario rechazado debe seguir disponible');
  });

  test('sin sesion devuelve 401', omiteSiNoHayBase(), async () => {
    const horario = await crearHorario(idMedicoGeneral, '2099-12-04');
    const r = await pedir('POST', '/api/fichas/reservar', { cuerpo: { id_horario: horario } });
    assert.equal(r.status, 401);
  });

  test('sin id_horario devuelve 400', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const r = await pedir('POST', '/api/fichas/reservar', { token: tokenDe(e1), cuerpo: {} });
    assert.equal(r.status, 400);
  });

  test('un horario inexistente devuelve 404', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const r = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: '00000000-0000-0000-0000-000000000000' }
    });
    assert.equal(r.status, 404);
  });
});

describe('reserva de ficha con especialista (US-08)', () => {
  test('recorrido completo: crea la ficha y consume la derivacion', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idDerivacion = await crearDerivacion(e1.id_estudiante);
    const horario = await crearHorario(idMedicoEspecialista, '2099-11-01');

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: horario, id_derivacion: idDerivacion }
    });

    assert.equal(r.status, 201, `esperaba 201 y llego ${r.status}: ${JSON.stringify(r.cuerpo)}`);
    assert.equal(r.cuerpo.data.ficha.tipo_ficha, 'ESPECIALISTA');

    const fichas = await q('SELECT id_ficha, estado FROM fichas_reservadas WHERE id_horario = $1', [horario]);
    assert.equal(fichas.length, 1);
    assert.equal(fichas[0].estado, 'RESERVADA');

    const derivacion = (await q('SELECT estado FROM ordenes_derivacion WHERE id_derivacion = $1', [idDerivacion]))[0];
    assert.equal(derivacion.estado, 'UTILIZADA', 'la orden debe quedar consumida en la misma transaccion');

    const { disponible } = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(disponible, false);
  });

  test('una derivacion ya consumida no sirve por segunda vez', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idDerivacion = await crearDerivacion(e1.id_estudiante);
    const primerHorario = await crearHorario(idMedicoEspecialista, '2099-11-02');
    const segundoHorario = await crearHorario(idMedicoEspecialista, '2099-11-03');

    const primera = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: primerHorario, id_derivacion: idDerivacion }
    });
    assert.equal(primera.status, 201);

    const segunda = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: segundoHorario, id_derivacion: idDerivacion }
    });
    assert.equal(segunda.status, 400);
    assert.match(segunda.cuerpo.message, /UTILIZADA/);
  });

  test('una derivacion ajena devuelve 404', omiteSiNoHayBase(), async () => {
    const [e1, e2] = estudiantes;
    const idDerivacion = await crearDerivacion(e2.id_estudiante);
    const horario = await crearHorario(idMedicoEspecialista, '2099-11-04');

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: horario, id_derivacion: idDerivacion }
    });
    assert.equal(r.status, 404, 'no se puede usar la derivacion de otro estudiante');
  });

  test('un medico de medicina general no acepta ficha de especialista', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idDerivacion = await crearDerivacion(e1.id_estudiante);
    const horario = await crearHorario(idMedicoGeneral, '2099-11-05');

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: horario, id_derivacion: idDerivacion }
    });
    assert.equal(r.status, 400);
    assert.match(r.cuerpo.message, /Medicina General/);
  });

  test('una especialidad que no coincide con la derivacion se rechaza', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const idDerivacion = await crearDerivacion(e1.id_estudiante);
    // Medico especialista de otra especialidad, que si puede atender, pero no la
    // que exige la derivacion.
    const otra = await q(
      `INSERT INTO especialidades (nombre) VALUES ($1) RETURNING id_especialidad`,
      [`${MARCA} - Oftalmologia`]
    );
    const otroMedico = await q(
      `INSERT INTO medicos (nombre_completo, es_especialista, id_especialidad)
       VALUES ($1, TRUE, $2) RETURNING id_medico`,
      [`${MARCA} - Medico Otra Especialidad`, otra[0].id_especialidad]
    );
    const horario = await crearHorario(otroMedico[0].id_medico, '2099-11-06');

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: horario, id_derivacion: idDerivacion }
    });
    assert.equal(r.status, 400);
    assert.match(r.cuerpo.message, /Incongruencia de especialidad/);
    // No se borra nada aqui: limpiarFixtures() quita medicos antes que
    // especialidades, que es el unico orden que no viola la clave foranea.
  });

  test('una ficha general el mismo dia bloquea la ficha con especialista', omiteSiNoHayBase(), async () => {
    const [e1] = estudiantes;
    const fecha = '2099-11-07';
    const general = await crearHorario(idMedicoGeneral, fecha, '08:00');
    const especialista = await crearHorario(idMedicoEspecialista, fecha, '10:00');
    const idDerivacion = await crearDerivacion(e1.id_estudiante);

    const primera = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: general }
    });
    assert.equal(primera.status, 201);

    const segunda = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e1),
      cuerpo: { id_horario: especialista, id_derivacion: idDerivacion }
    });
    assert.equal(segunda.status, 409, 'la regla de un dia aplica sin importar el tipo de ficha');

    const derivacion = (await q('SELECT estado FROM ordenes_derivacion WHERE id_derivacion = $1', [idDerivacion]))[0];
    assert.equal(derivacion.estado, 'ACTIVA', 'una reserva rechazada no debe consumir la derivacion');
  });

  test('sin sesion devuelve 401', omiteSiNoHayBase(), async () => {
    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      cuerpo: { id_horario: 'x', id_derivacion: 'y' }
    });
    assert.equal(r.status, 401);
  });
});

describe('gate de cobertura', () => {
  test('sin afiliacion: reserva general devuelve 403 SIN_AFILIACION', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('SINAFIL');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-10');

    const r = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'SIN_AFILIACION');
    assert.equal(r.cuerpo.error.accion_sugerida, '/registro');

    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, true, 'el rechazo no debe consumir el horario');
  });

  test('afiliacion vencida: reserva general devuelve 403 VENCIDA', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('VENCIDA');
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA-V', CURRENT_DATE - 100, CURRENT_DATE - 5, 'ACTIVA')`,
      [e.id_estudiante]
    );
    const horario = await crearHorario(idMedicoGeneral, '2099-12-11');

    const r = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'VENCIDA');
    assert.equal(r.cuerpo.error.accion_sugerida, '/renovacion');
  });

  test('afiliacion vencida: emitir derivacion devuelve 403', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('DERIV');
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA-V', CURRENT_DATE - 100, CURRENT_DATE - 5, 'ACTIVA')`,
      [e.id_estudiante]
    );

    const r = await pedir('POST', '/api/derivaciones/', {
      token: tokenDe(e),
      cuerpo: { id_medico_emisor: idMedicoGeneral, id_especialidad_requerida: idEspecialidad }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'VENCIDA');

    const n = (await q('SELECT COUNT(*)::int AS n FROM ordenes_derivacion WHERE id_estudiante = $1', [e.id_estudiante]))[0];
    assert.equal(n.n, 0, 'el rechazo no debe crear la derivacion');
  });

  test('cobertura futura: reserva devuelve 403 FUTURA', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('FUTURA');
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA-V', CURRENT_DATE + 5, CURRENT_DATE + 100, 'ACTIVA')`,
      [e.id_estudiante]
    );
    const horario = await crearHorario(idMedicoGeneral, '2099-12-12');

    const r = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'FUTURA');
  });

  test('afiliacion INACTIVA: reserva general devuelve 403 INACTIVA', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('INACTIVA');
    // Fechas todavía por vencer a proposito: comprueba que el estado INACTIVA manda
    // sobre el calendario, porque el servicio lo evalua antes que los dias que
    // quedan. Con una afiliacion vencida el caso seria indistinguible de VENCIDA.
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA-I', CURRENT_DATE - 10, CURRENT_DATE + 100, 'INACTIVA')`,
      [e.id_estudiante]
    );
    const horario = await crearHorario(idMedicoGeneral, '2099-12-13');

    const r = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'INACTIVA');
    assert.equal(r.cuerpo.error.accion_sugerida, '/renovacion');

    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, true, 'el rechazo no debe consumir el horario');
  });

  test('ficha de especialista sin afiliacion: devuelve 403 SIN_AFILIACION', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('ESPEC');
    const horario = await crearHorario(idMedicoEspecialista, '2099-11-10');
    const derivacion = await crearDerivacion(e.id_estudiante);

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario, id_derivacion: derivacion }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'SIN_AFILIACION');
    assert.equal(r.cuerpo.error.accion_sugerida, '/registro');

    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, true, 'el rechazo no debe consumir el horario de especialista');

    const fichas = await q('SELECT COUNT(*)::int AS n FROM fichas_reservadas WHERE id_horario = $1', [horario]);
    assert.equal(fichas[0].n, 0, 'el rechazo no debe crear ficha');
  });

  test('ficha de especialista con afiliacion vencida: devuelve 403 VENCIDA', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('ESPECV');
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, 'PRUEBA-V', CURRENT_DATE - 100, CURRENT_DATE - 5, 'ACTIVA')`,
      [e.id_estudiante]
    );
    const horario = await crearHorario(idMedicoEspecialista, '2099-11-11');
    const derivacion = await crearDerivacion(e.id_estudiante);

    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDe(e),
      cuerpo: { id_horario: horario, id_derivacion: derivacion }
    });
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error.estado_efectivo, 'VENCIDA');
    assert.equal(r.cuerpo.error.accion_sugerida, '/renovacion');

    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, true, 'el rechazo no debe consumir el horario de especialista');
  });
});

describe('cancelación de ficha (US-07)', () => {
  const nuevaFicha = async (idEstudiante, idHorario, estado = 'RESERVADA') => {
    const f = await q(
      `INSERT INTO fichas_reservadas (id_estudiante, id_horario, tipo_ficha, estado)
       VALUES ($1, $2, 'GENERAL', $3) RETURNING id_ficha`,
      [idEstudiante, idHorario, estado]
    );
    return f[0].id_ficha;
  };

  test('cancelar una ficha propia futura: 200, estado CANCELADA_USUARIO y horario disponible', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('CANC');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-20', '09:00');
    const idFicha = await nuevaFicha(e.id_estudiante, horario);
    await q('UPDATE horarios_atencion SET disponible = FALSE WHERE id_horario = $1', [horario]);

    const r = await pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(e) });
    assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.data.ficha.estado, 'CANCELADA_USUARIO');

    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, true, 'al cancelar debe liberar el horario');
  });

  test('cancelar con menos de 2h para la cita: 409 y la ficha sigue RESERVADA', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('CANCPROX');
    const ahora = new Date();
    // Cita a +1h: dentro del margen de 2h exigido. fecha y hora se calculan en La Paz.
    const prox = new Date(ahora.getTime() + 60 * 60 * 1000);
    const fechaProx = prox.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const horaProx = prox.toLocaleTimeString('en-GB', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' });

    const h = await q(
      `INSERT INTO horarios_atencion (id_medico, fecha, hora_inicio, hora_fin, consultorio)
       VALUES ($1, $2, $3, $3, 'PRUEBA') RETURNING id_horario`,
      [idMedicoGeneral, fechaProx, horaProx]
    );
    const idFicha = await nuevaFicha(e.id_estudiante, h[0].id_horario);

    const r = await pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(e) });
    assert.equal(r.status, 409, JSON.stringify(r.cuerpo));

    const f = (await q('SELECT estado FROM fichas_reservadas WHERE id_ficha = $1', [idFicha]))[0];
    assert.equal(f.estado, 'RESERVADA');
  });

  test('cancelar la ficha de otro estudiante: 403 y no cambia nada', omiteSiNoHayBase(), async () => {
    const dueño = await crearEstudianteSinCobertura('CANCD1');
    const otro = await crearEstudianteSinCobertura('CANCD2');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-21', '10:00');
    const idFicha = await nuevaFicha(dueño.id_estudiante, horario);
    await q('UPDATE horarios_atencion SET disponible = FALSE WHERE id_horario = $1', [horario]);

    const r = await pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(otro) });
    assert.equal(r.status, 403);

    const f = (await q('SELECT estado FROM fichas_reservadas WHERE id_ficha = $1', [idFicha]))[0];
    assert.equal(f.estado, 'RESERVADA');
    const h = (await q('SELECT disponible FROM horarios_atencion WHERE id_horario = $1', [horario]))[0];
    assert.equal(h.disponible, false);
  });

  test('cancelar una ficha que ya no es activa: 409', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('CANC2');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-22', '11:00');
    const idFicha = await nuevaFicha(e.id_estudiante, horario, 'ASISTIO');

    const r = await pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(e) });
    assert.equal(r.status, 409);
  });

  test('tras cancelar, otro estudiante puede reservar el mismo horario (índice único parcial)', omiteSiNoHayBase(), async () => {
    const primero = await crearEstudianteSinCobertura('CANCR1');
    const segundo = await crearEstudianteSinCobertura('CANCR2');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-23', '12:00');
    const idFicha = await nuevaFicha(primero.id_estudiante, horario);
    await q('UPDATE horarios_atencion SET disponible = FALSE WHERE id_horario = $1', [horario]);

    const r = await pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(primero) });
    assert.equal(r.status, 200, JSON.stringify(r.cuerpo));

    // La cancelación libera el horario; el índice parcial permite una nueva ficha
    // ACTIVA sobre el mismo horario. Se comprueba a nivel BD para no depender de
    // cobertura, que ya tiene su propio gate.
    const segunda = await q(
      `INSERT INTO fichas_reservadas (id_estudiante, id_horario, tipo_ficha, estado)
       VALUES ($1, $2, 'GENERAL', 'RESERVADA') RETURNING id_ficha`,
      [segundo.id_estudiante, horario]
    );
    assert.equal(segunda.length, 1, 'debe poder insertarse una ficha activa sobre el horario liberado');
  });

  test('cancelar concurrente sobre la misma ficha: una gana y la otra 409', omiteSiNoHayBase(), async () => {
    const e = await crearEstudianteSinCobertura('CANCX');
    const horario = await crearHorario(idMedicoGeneral, '2099-12-24', '13:00');
    const idFicha = await nuevaFicha(e.id_estudiante, horario);
    await q('UPDATE horarios_atencion SET disponible = FALSE WHERE id_horario = $1', [horario]);

    const [r1, r2] = await Promise.all([
      pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(e) }),
      pedir('POST', `/api/fichas/${idFicha}/cancelar`, { token: tokenDe(e) })
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409].sort(), 'una debe ganar y la otra 409');
  });
});
