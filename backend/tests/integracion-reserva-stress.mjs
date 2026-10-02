/**
 * PRUEBA DE ESTRÉS Y CONCURRENCIA — módulo de reservas (US-03, US-08)
 * -----------------------------------------------------------------------------
 * Extiende integracion-reserva.mjs con pruebas de carga y concurrencia alta.
 * Corre contra la base real y la app Express en memoria.
 *
 * Casos que cubre:
 *   - 20 estudiantes compitiendo por el mismo horario (thundering herd)
 *   - 15 estudiantes intentando reservar diferentes horarios el mismo día
 *     (verifica regla de una ficha por estudiante/día bajo carga)
 *   - Lecturas concurrentes de disponibilidad mientras se escriben reservas
 *   - Verificación de aislamiento de transacciones (no dirty reads)
 *   - Reservas con especialista bajo concurrencia
 *
 * AISLAMIENTO: medicos, especialidades y horarios usan el prefijo
 * PRUEBA-ESTRES y fechas en año 2099; cada caso usa fecha distinta para no
 * interferir. Los estudiantes son propios de esta prueba (prefijo ESTRES-) y
 * no se toman del padron, porque las reservas exigen afiliacion vigente y el
 * padron no la tiene de forma uniforme: mezclarlos haria fallar el analisis
 * de codigos por cobertura en vez de por concurrencia. Los prefijos ESTRES- no
 * chocan con los PRUEBA- de integracion-reserva.mjs, asi que ambos archivos
 * pueden correr en paralelo (node --test lanza los archivos a la vez).
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

const MARCA = 'PRUEBA-ESTRES';
const PREFIJO_ESTUDIANTE = 'ESTRES-';
// `periodo_semestral` es VARCHAR(10), asi que el prefijo tiene que caber con el
// numero de estudiante pegado: 'ESTRES' + '-' + 2 digitos = 8.
const PREFIJO_PERIODO = 'ESTRES';
const CANTIDAD_ESTUDIANTES = 30;
const HAY_BASE = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

let pool;
let server;
let base;
let app;
let idMedicoGeneral;
let idMedicoEspecialista;
let idEspecialidad;
let estudiantes;
let TESTS_HABILITADOS = false;

const q = async (texto, params = []) => (await pool.query(texto, params)).rows;

/**
 * Crea estudiantes propios de la prueba, cada uno con afiliacion vigente.
 *
 * No se toman del padron a proposito. Desde que las reservas exigen afiliacion
 * vigente (`requireCoberturaActiva`), un estudiante sin cobertura recibe 403 y
 * las aserciones de este archivo —que cuentan 201 y 409— dejarian de medir
 * concurrencia y medirian cobertura. Con estudiantes propios y cobertura
 * controlada, cada codigo de respuesta se puede atribuir a su causa.
 *
 * El periodo no empieza con PRUEBA a proposito: integracion-reserva.mjs borra
 * `periodo_semestral LIKE 'PRUEBA%'` al limpiar sus fixtures, y como los dos
 * archivos corren en paralelo, ese borrado se llevaria por delante estas
 * afiliaciones en mitad de la corrida.
 */
const crearEstudiantesCubiertos = async (cantidad) => {
  const creados = [];
  for (let i = 1; i <= cantidad; i++) {
    const sufijo = String(i).padStart(2, '0');
    const r = await q(
      `INSERT INTO estudiantes (sis, cedula_identidad, nombre_completo, facultad, carrera)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_estudiante, sis, nombre_completo`,
      [`${PREFIJO_ESTUDIANTE}${sufijo}`, `E${sufijo.padStart(9, '0')}`, `Estudiante Estres ${sufijo}`, 'Medicina', 'Medicina']
    );
    const est = r[0];
    await q(
      `INSERT INTO afiliaciones (id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento, estado)
       VALUES ($1, $2, CURRENT_DATE - 10, CURRENT_DATE + 100, 'ACTIVA')`,
      [est.id_estudiante, `${PREFIJO_PERIODO}-${sufijo}`]
    );
    creados.push(est);
  }
  return creados;
};

/**
 * Borra los fixtures de la prueba. Se ejecuta AL EMPEZAR y AL TERMINAR, y en
 * ambos casos con el mismo criterio que usa esta prueba para crear: los medicos
 * se localizan por nombre y los horarios por consultorio, ambos con el prefijo
 * PRUEBA-ESTRES.
 *
 * El orden importa por las claves foraneas: `fichas_medicas_id_horario_fkey` es
 * RESTRICT, asi que la ficha tiene queirse antes que el horario. Si la limpieza
 * no borra todas las fichas, el borrado de horarios falla con 23503 y la prueba
 * se cancela en cascada; ademas el fallo es persistente, porque los fixtures a
 * medias bloquean la siguiente corrida.
 */
const limpiarFixtures = async () => {
  await q('DELETE FROM fichas_reservadas WHERE id_horario IN (SELECT id_horario FROM horarios_atencion WHERE consultorio LIKE $1)', [`${MARCA}%`]);
  await q('DELETE FROM ordenes_derivacion WHERE id_medico_emisor IN (SELECT id_medico FROM medicos WHERE nombre_completo LIKE $1)', [`${MARCA}%`]);
  await q('DELETE FROM horarios_atencion WHERE consultorio LIKE $1', [`${MARCA}%`]);
  await q('DELETE FROM medicos WHERE nombre_completo LIKE $1', [`${MARCA}%`]);
  await q('DELETE FROM especialidades WHERE nombre LIKE $1', [`${MARCA}%`]);
  // Los estudiantes dedicated se van al final: CASCADE arrastra sus afiliaciones,
  // fichas y derivaciones, y asi no hay que perseguirlos uno por uno.
  await q('DELETE FROM estudiantes WHERE sis LIKE $1', [`${PREFIJO_ESTUDIANTE}%`]);
};

before(async () => {
  if (!HAY_BASE) {
    console.log('\n  [omitida] Sin DATABASE_URL: no hay base para pruebas de estrés.\n');
    return;
  }

  // Supabase en modo SESION (pooler en el puerto 5432) limita a 15 conexiones por
  // proyecto, y no todas son del backend: PostgREST, pg_cron, pg_net y
  // postgres_exporter ocupan unas 10 de forma permanente. El .env del equipo trae
  // PG_POOL_MAX=20, que es mas que el presupuesto real, asi que el pico de
  // peticiones simultaneas de estas pruebas revienta el tope del pooler con
  // EMAXCONNSESSION: un error de infraestructura que no dice nada de la
  // concurrencia de la reserva.
//
// Por eso el valor se sobrescribe en vez de respetar el del .env. Las peticiones
 // simultaneas siguen siendo decenas (eso es lo que se pone a prueba); lo que se
  // acota es cuantas pueden estar EN COLA en la base a la vez.
  //
  // 10 + 1 (esta prueba) = 11 de las 15 disponibles: las otras 4 son de los
  // servicios de Supabase. Con menos, las peticiones en cola agotan el
  // connectionTimeoutMillis de 5s y el test falla por tiempo de espera en vez
  // de por concurrencia.
  process.env.PG_POOL_MAX = '10';

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

  const esp = await q(
    `INSERT INTO especialidades (nombre, descripcion) VALUES ($1, $2) RETURNING id_especialidad`,
    [`${MARCA} - Cardiologia`, 'Especialidad para pruebas de estrés']
  );
  idEspecialidad = esp[0].id_especialidad;

  const gral = await q(
    `INSERT INTO medicos (nombre_completo, es_especialista) VALUES ($1, FALSE) RETURNING id_medico`,
    [`${MARCA} - Dr. Estres General`]
  );
  idMedicoGeneral = gral[0].id_medico;

  const espMed = await q(
    `INSERT INTO medicos (nombre_completo, es_especialista, id_especialidad) VALUES ($1, TRUE, $2) RETURNING id_medico`,
    [`${MARCA} - Dra. Estres Cardio`, idEspecialidad]
  );
  idMedicoEspecialista = espMed[0].id_medico;

  estudiantes = await crearEstudiantesCubiertos(CANTIDAD_ESTUDIANTES);
  if (estudiantes.length < 20) {
    console.log(`  [omitida] Solo ${estudiantes.length} estudiantes de prueba; se necesitan 20+ para estrés.\n`);
    TESTS_HABILITADOS = false;
    return;
  }
  TESTS_HABILITADOS = true;
});

after(async () => {
  if (!pool) return;
  await limpiarFixtures();
  server?.close();
  await pool.end();
  console.log('\n  fixtures de estrés eliminados; base limpia\n');
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

const omiteSiNoHayBase = () => (HAY_BASE && TESTS_HABILITADOS ? false : 'sin DATABASE_URL o insuficientes estudiantes: se omite estrés');

/** Crea N horarios consecutivos para el mismo médico en la misma fecha. */
const crearHorarios = async (idMedico, fecha, baseHora = 8, cantidad = 10) => {
  const horarios = [];
  for (let i = 0; i < cantidad; i++) {
    const h = (baseHora + i).toString().padStart(2, '0');
    const hFin = (baseHora + i + 1).toString().padStart(2, '0');
    const res = await q(
      `INSERT INTO horarios_atencion (id_medico, fecha, hora_inicio, hora_fin, consultorio)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_horario`,
      [idMedico, fecha, `${h}:00`, `${hFin}:00`, `${MARCA}-SALA`]
    );
    horarios.push(res[0].id_horario);
  }
  return horarios;
};

const crearDerivacion = async (idEstudiante) => {
  const d = await q(
    `INSERT INTO ordenes_derivacion (id_estudiante, id_medico_emisor, estado, id_especialidad_requerida)
     VALUES ($1, $2, 'ACTIVA', $3) RETURNING id_derivacion`,
    [idEstudiante, idMedicoGeneral, idEspecialidad]
  );
  return d[0].id_derivacion;
};

const tokenDeEst = (e) =>
  jwt.sign({ id_estudiante: e.id_estudiante, sis: e.sis }, process.env.JWT_SECRET, { expiresIn: '8h' });

describe('estrés: thundering herd — mismo horario, muchos estudiantes (US-03)', () => {
  test('20 peticiones simultáneas al mismo horario: solo 1 éxito, 19 rechazos 409', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-01';
    const [horario] = await crearHorarios(idMedicoGeneral, fecha, 8, 1);
    const competidores = estudiantes.slice(0, 20);

    const promesas = competidores.map((est) =>
      pedir('POST', '/api/fichas/reservar', {
        token: tokenDeEst(est),
        cuerpo: { id_horario: horario }
      })
    );

    const resultados = await Promise.all(promesas);

    const exitos = resultados.filter((r) => r.status === 201);
    const conflictos = resultados.filter((r) => r.status === 409);
    const otros = resultados.filter((r) => r.status !== 201 && r.status !== 409);

    assert.equal(exitos.length, 1, `debe haber exactamente 1 éxito, hubo ${exitos.length}`);
    assert.equal(conflictos.length, 19, `debe haber 19 conflictos 409, hubo ${conflictos.length}`);
    assert.equal(otros.length, 0, `no debe haber otros códigos: ${otros.map((o) => o.status).join(', ')}`);

    const fichas = await q('SELECT COUNT(*) AS n FROM fichas_reservadas WHERE id_horario = $1', [horario]);
    assert.equal(parseInt(fichas[0].n, 10), 1, 'solo una ficha en BD');
  });

  test('10 peticiones simultáneas, luego otras 10 tras 100ms: segunda ola recibe 409', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-02';
    const [horario] = await crearHorarios(idMedicoGeneral, fecha, 9, 1);
    const grupo1 = estudiantes.slice(0, 10);
    const grupo2 = estudiantes.slice(10, 20);

    const p1 = Promise.all(grupo1.map((est) =>
      pedir('POST', '/api/fichas/reservar', { token: tokenDeEst(est), cuerpo: { id_horario: horario } })
    ));
    await new Promise((r) => setTimeout(r, 100));
    const p2 = Promise.all(grupo2.map((est) =>
      pedir('POST', '/api/fichas/reservar', { token: tokenDeEst(est), cuerpo: { id_horario: horario } })
    ));

    const [r1, r2] = await Promise.all([p1, p2]);
    const todos = [...r1, ...r2];

    const exitos = todos.filter((r) => r.status === 201);
    const conflictos = todos.filter((r) => r.status === 409);

    assert.equal(exitos.length, 1, 'solo la primera reserva debe tener éxito');
    assert.equal(conflictos.length, 19, 'todas las demás deben ser 409');
  });
});

describe('estrés: regla una ficha por estudiante/día bajo carga (US-03)', () => {
  test('15 estudiantes: cada uno intenta 2 horarios mismo día — solo 1 éxito por estudiante', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-03';
    const fechaSiguiente = '2099-12-10';
    const competidores = estudiantes.slice(0, 15);

    // Cada estudiante necesita un PAR PROPIO de horarios en un MISMO dia. Si todos
    // compartieran los mismos dos, solo podrian ganar dos en total (uno por
    // horario) y la asercion de "1 exito por estudiante" seria imposible de
    // cumplir.
    //
    // Un dia no alcanza: `hora_inicio` es TIME y 15 pares desde las 08:00
    // llegarian a las 25:00. Por eso los pares se reparten entre dos dias, con
    // horas distintas en cada uno para no chocar con `uq_medico_horario`.
    const horarios = [];
    for (let i = 0; i < competidores.length; i++) {
      const dia = i % 2 === 0 ? fecha : fechaSiguiente;
      const bloque = Math.floor(i / 2);
      horarios.push(...(await crearHorarios(idMedicoGeneral, dia, 8 + bloque * 2, 2)));
    }

    const promesas = competidores.flatMap((est, i) => [
      pedir('POST', '/api/fichas/reservar', { token: tokenDeEst(est), cuerpo: { id_horario: horarios[i * 2] } }),
      pedir('POST', '/api/fichas/reservar', { token: tokenDeEst(est), cuerpo: { id_horario: horarios[i * 2 + 1] } })
    ]);

    const resultados = await Promise.all(promesas);

    const porEstudiante = new Map();
    for (let i = 0; i < competidores.length; i++) {
      const est = competidores[i];
      const r1 = resultados[i * 2];
      const r2 = resultados[i * 2 + 1];
      const exitos = [r1, r2].filter((r) => r.status === 201).length;
      porEstudiante.set(est.id_estudiante, exitos);
    }

    for (const [, exitos] of porEstudiante) {
      assert.equal(exitos, 1, 'cada estudiante debe tener exactamente 1 ficha exitosa');
    }

    // Se cuenta sobre TODOS los horarios creados, no sobre un par: cada
    // estudiante aporta exactamente una ficha, asi que el total es 15.
    const totalFichas = await q('SELECT COUNT(*) AS n FROM fichas_reservadas WHERE id_horario = ANY($1)', [horarios]);
    assert.equal(parseInt(totalFichas[0].n, 10), 15, 'deben crearse 15 fichas totales (una por estudiante)');
  });

  test('estudiante intenta 5 horarios mismo día en ráfaga: solo 1 éxito', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-04';
    const horarios = await crearHorarios(idMedicoGeneral, fecha, 8, 5);
    const [estudiante] = estudiantes;

    const promesas = horarios.map((h) =>
      pedir('POST', '/api/fichas/reservar', { token: tokenDeEst(estudiante), cuerpo: { id_horario: h } })
    );

    const resultados = await Promise.all(promesas);
    const exitos = resultados.filter((r) => r.status === 201);
    const conflictos = resultados.filter((r) => r.status === 409);

    assert.equal(exitos.length, 1);
    assert.equal(conflictos.length, 4);
  });
});

describe('estrés: lecturas concurrentes de disponibilidad (US-03)', () => {
  test('50 lecturas GET /api/medicos/turnos-disponibles mientras se escriben reservas', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-05';
    const horarios = await crearHorarios(idMedicoGeneral, fecha, 8, 10);

    // Iniciar escrituras en segundo plano
    const escritores = estudiantes.slice(0, 5).map((est, i) =>
      pedir('POST', '/api/fichas/reservar', {
        token: tokenDeEst(est),
        cuerpo: { id_horario: horarios[i] }
      })
    );

    // Lecturas concurrentes
    const lecturas = Array.from({ length: 50 }, () =>
      fetch(`${base}/api/medicos/turnos-disponibles?fecha=${fecha}`).then((r) => r.json())
    );

    const [resultadosEscritura, resultadosLectura] = await Promise.all([
      Promise.all(escritores),
      Promise.all(lecturas)
    ]);

    // Todas las lecturas deben responder 200 (via fetch ok) y tener estructura válida
    for (const lec of resultadosLectura) {
      assert.ok(Array.isArray(lec.data), 'lectura debe devolver array de horarios');
    }

    // Las escrituras: 5 éxitos, 0 conflictos (horarios distintos)
    const ok = resultadosEscritura.filter((r) => r.status === 201);
    assert.equal(ok.length, 5);
  });
});

describe('estrés: aislamiento de transacciones — no dirty reads (US-03)', () => {
  test('transacción fallida no deja ficha fantasma visible', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-06';
    const [horario] = await crearHorarios(idMedicoGeneral, fecha, 10, 1);
    const [est1, est2] = estudiantes;

    // est1 reserva
    const r1 = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDeEst(est1),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r1.status, 201);

    // est2 intenta mismo horario -> debe fallar 409
    const r2 = await pedir('POST', '/api/fichas/reservar', {
      token: tokenDeEst(est2),
      cuerpo: { id_horario: horario }
    });
    assert.equal(r2.status, 409);

    // Verificar que SOLO la ficha de est1 existe
    const fichas = await q(
      `SELECT fr.id_ficha, e.sis
       FROM fichas_reservadas fr
       JOIN estudiantes e ON fr.id_estudiante = e.id_estudiante
       WHERE fr.id_horario = $1`,
      [horario]
    );
    assert.equal(fichas.length, 1);
    assert.equal(fichas[0].sis, est1.sis);
  });

  test('rollback de transacción por error de derivación no deja ficha parcial', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-07';
    const [horario] = await crearHorarios(idMedicoEspecialista, fecha, 11, 1);
    const [est1] = estudiantes;

    // Intentar reservar con especialista SIN derivación válida -> debe fallar 400/404
    const r = await pedir('POST', '/api/fichas-especialista/reservar', {
      token: tokenDeEst(est1),
      cuerpo: { id_horario: horario, id_derivacion: '00000000-0000-0000-0000-000000000000' }
    });
    assert.ok([400, 404].includes(r.status), `esperaba 400 o 404, llegó ${r.status}`);

    // Verificar que NO se creó ninguna ficha
    const fichas = await q('SELECT COUNT(*) AS n FROM fichas_reservadas WHERE id_horario = $1', [horario]);
    assert.equal(parseInt(fichas[0].n, 10), 0, 'rollback debe evitar ficha parcial');
  });
});

describe('estrés: reservas con especialista bajo concurrencia (US-08)', () => {
  test('10 estudiantes con derivaciones distintas compiten por 5 horarios de especialista', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-08';
    const horarios = await crearHorarios(idMedicoEspecialista, fecha, 14, 5);
    const competidores = estudiantes.slice(0, 10);

    // Crear derivaciones para cada uno
    const derivaciones = await Promise.all(competidores.map((est) => crearDerivacion(est.id_estudiante)));

    const promesas = competidores.map((est, i) =>
      pedir('POST', '/api/fichas-especialista/reservar', {
        token: tokenDeEst(est),
        cuerpo: { id_horario: horarios[i % 5], id_derivacion: derivaciones[i] }
      })
    );

    const resultados = await Promise.all(promesas);

    const exitos = resultados.filter((r) => r.status === 201);
    const conflictos = resultados.filter((r) => r.status === 409);
    const otros = resultados.filter((r) => r.status !== 201 && r.status !== 409);

    assert.equal(exitos.length, 5, 'solo 5 horarios disponibles -> 5 éxitos');
    assert.equal(conflictos.length, 5, '5 conflictos 409 por horarios agotados');
    assert.equal(otros.length, 0, `no otros códigos: ${otros.map((o) => o.status).join(', ')}`);

    // Verificar que las 5 derivaciones usadas pasaron a UTILIZADA
    const derivs = await q('SELECT estado FROM ordenes_derivacion WHERE id_derivacion = ANY($1)', [Object.values(derivaciones).flat()]);
    const utilizadas = derivs.filter((d) => d.estado === 'UTILIZADA');
    assert.equal(utilizadas.length, 5, '5 derivaciones deben marcarse UTILIZADA');
  });

  test('mismo estudiante intenta 2 reservas de especialista con 2 derivaciones: solo 1 éxito por regla 1 ficha/día', omiteSiNoHayBase(), async () => {
    const fecha = '2099-12-09';
    const horarios = await crearHorarios(idMedicoEspecialista, fecha, 15, 3);
    const [est] = estudiantes;

    const d1 = await crearDerivacion(est.id_estudiante);
    const d2 = await crearDerivacion(est.id_estudiante);

    const [r1, r2] = await Promise.all([
      pedir('POST', '/api/fichas-especialista/reservar', {
        token: tokenDeEst(est),
        cuerpo: { id_horario: horarios[0], id_derivacion: d1 }
      }),
      pedir('POST', '/api/fichas-especialista/reservar', {
        token: tokenDeEst(est),
        cuerpo: { id_horario: horarios[1], id_derivacion: d2 }
      })
    ]);

    const exitos = [r1, r2].filter((r) => r.status === 201);
    const conflictos = [r1, r2].filter((r) => r.status === 409);

    assert.equal(exitos.length, 1, 'regla 1 ficha/día aplica también a especialista');
    assert.equal(conflictos.length, 1);
  });
});