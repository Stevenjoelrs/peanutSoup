/**
 * FASE 3 — fechas calendario puras (US-01, US-12)
 * -----------------------------------------------------------------------------
 * Regla: DATE -> calendario ('YYYY-MM-DD', America/La_Paz), nunca `new Date`.
 * TIMESTAMPTZ -> instante. No mezclar ambos conceptos.
 *
 * Son pruebas unitarias puras: no tocan la base ni la red. El `node --test`
 * del backend las corre junto a las de integración.
 *
 * Casos que cubre:
 *   - bisiesto real (2024-02-29) vs 28 de febrero no bisiesto (2025-02-28)
 *   - fin de mes (31/30 y el 31 de abril que no existe)
 *   - cambio de año (2024-12-31 -> 2025-01-01)
 *   - fechas exactamente iguales
 *   - vencimiento = hoy (0 días) renueva; 30 días renueva; 31 días no;
 *     vencida (negativos) no renueva: corresponde afiliación nueva
 *   - el SQL de vigencia/elegibilidad usa La Paz y la ventana 0-30
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'node:fs';
import {
  calcularProgresoSemestral,
  compararFechas,
  diasEntreCalendario,
  esFechaCalendarioValida,
  evaluarVentanaRenovacion,
  hoyLaPazISO,
  normalizarFecha
} from '../src/shared/http/fechas.js';
import { esFechaValida } from '../src/shared/http/validadores.js';

describe('esFechaCalendarioValida: día real con bisiesto', () => {
  test('2024-02-29 es válida (bisiesto real)', () => {
    assert.equal(esFechaCalendarioValida('2024-02-29'), true);
  });
  test('2025-02-28 es válida (febrero no bisiesto)', () => {
    assert.equal(esFechaCalendarioValida('2025-02-28'), true);
  });
  test('2023-02-29 es inválida (no fue bisiesto)', () => {
    assert.equal(esFechaCalendarioValida('2023-02-29'), false);
  });
  test('2024-02-30 es inválida (`new Date` la redondeaba a marzo)', () => {
    assert.equal(esFechaCalendarioValida('2024-02-30'), false);
  });
  test('fin de mes: 31 de enero sí, 31 de abril no', () => {
    assert.equal(esFechaCalendarioValida('2025-01-31'), true);
    assert.equal(esFechaCalendarioValida('2025-04-30'), true);
    assert.equal(esFechaCalendarioValida('2025-04-31'), false);
  });
  test('mes 13, mes 00 y formatos no ISO son inválidos', () => {
    assert.equal(esFechaCalendarioValida('2025-13-01'), false);
    assert.equal(esFechaCalendarioValida('2025-00-10'), false);
    assert.equal(esFechaCalendarioValida('2025-2-28'), false);
    assert.equal(esFechaCalendarioValida('2025/02/28'), false);
    assert.equal(esFechaCalendarioValida(''), false);
    assert.equal(esFechaCalendarioValida(null), false);
    assert.equal(esFechaCalendarioValida(20250228), false);
  });
  test('esFechaValida del contrato hereda la regla (2024-02-30 ya no pasa)', () => {
    assert.equal(esFechaValida('2024-02-29'), true);
    assert.equal(esFechaValida('2024-02-30'), false);
  });
});

describe('normalizarFecha y compararFechas: calendario, no instantes', () => {
  test('corta el tiempo de un ISO con hora', () => {
    assert.equal(normalizarFecha('2025-07-31T00:00:00.000Z'), '2025-07-31');
  });
  test('un Date de medianoche local normaliza al mismo calendario', () => {
    assert.equal(normalizarFecha(new Date(2025, 6, 31)), '2025-07-31');
  });
  test('lo inválido normaliza a null', () => {
    assert.equal(normalizarFecha('2024-02-30'), null);
    assert.equal(normalizarFecha(null), null);
  });
  test('cambio de año: 2024-12-31 < 2025-01-01', () => {
    assert.equal(compararFechas('2024-12-31', '2025-01-01'), -1);
    assert.equal(compararFechas('2025-01-01', '2024-12-31'), 1);
  });
  test('fechas exactamente iguales comparan a 0 (se permiten)', () => {
    assert.equal(compararFechas('2025-02-01', '2025-02-01'), 0);
  });
  test('fin de febrero contra marzo', () => {
    assert.equal(compararFechas('2025-02-28', '2025-03-01'), -1);
    assert.equal(compararFechas('2024-02-29', '2024-03-01'), -1);
  });
});

describe('diasEntreCalendario: aritmética de días sin DST', () => {
  test('el mismo día son 0 días', () => {
    assert.equal(diasEntreCalendario('2025-07-31', '2025-07-31'), 0);
  });
  test('2025-02-28 -> 2025-03-01 es 1 día (no bisiesto)', () => {
    assert.equal(diasEntreCalendario('2025-02-28', '2025-03-01'), 1);
  });
  test('2024-02-28 -> 2024-03-01 son 2 días (pasa por el 29)', () => {
    assert.equal(diasEntreCalendario('2024-02-28', '2024-03-01'), 2);
  });
  test('cambio de año: 2024-12-31 -> 2025-01-01 es 1 día', () => {
    assert.equal(diasEntreCalendario('2024-12-31', '2025-01-01'), 1);
  });
});

describe('evaluarVentanaRenovacion: ventana cerrada 0-30', () => {
  test('exactamente 30 días antes procede', () => {
    assert.deepEqual(evaluarVentanaRenovacion(30), { procede: true, motivo: 'dentro' });
  });
  test('exactamente 31 días antes no procede (motivo lejos)', () => {
    assert.deepEqual(evaluarVentanaRenovacion(31), { procede: false, motivo: 'lejos' });
  });
  test('vencimiento = hoy (0 días) procede', () => {
    assert.deepEqual(evaluarVentanaRenovacion(0), { procede: true, motivo: 'dentro' });
  });
  test('vencida (días negativos) no renueva: corresponde afiliación nueva', () => {
    assert.deepEqual(evaluarVentanaRenovacion(-1), { procede: false, motivo: 'vencida' });
  });
  test('134 días (caso maqueta I-2025) no procede', () => {
    assert.deepEqual(evaluarVentanaRenovacion(134), { procede: false, motivo: 'lejos' });
  });
});

describe('hoyLaPazISO y calcularProgresoSemestral', () => {
  test('02:00 UTC es todavía ayer en La Paz (UTC-4)', () => {
    assert.equal(hoyLaPazISO(new Date('2025-03-15T02:00:00Z')), '2025-03-14');
  });
  test('05:00 UTC ya es hoy en La Paz', () => {
    assert.equal(hoyLaPazISO(new Date('2025-03-15T05:00:00Z')), '2025-03-15');
  });
  test('progreso en días calendario: inicio 0, fin 100, mitad 50', () => {
    assert.equal(calcularProgresoSemestral('2025-02-01', '2025-07-31', '2025-02-01'), 0);
    assert.equal(calcularProgresoSemestral('2025-02-01', '2025-07-31', '2025-07-31'), 100);
    assert.equal(calcularProgresoSemestral('2025-02-01', '2025-07-31', '2025-05-02'), 50);
  });
  test('fuera de rango se acota y rango inválido da 0', () => {
    assert.equal(calcularProgresoSemestral('2025-02-01', '2025-07-31', '2025-08-15'), 100);
    assert.equal(calcularProgresoSemestral('2025-02-01', '2025-07-31', '2025-01-01'), 0);
    assert.equal(calcularProgresoSemestral('2025-07-31', '2025-07-31', '2025-07-31'), 0);
  });
});

describe('SQL de vigencia: La Paz y ventana 0-30 (guardia Fase 3)', () => {
  const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const leer = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');
  const repos = [
    'afiliacion/afiliacion.repository.js',
    'auth/auth.repository.js',
    'estudiantes/estudiantes.repository.js'
  ];
  for (const rel of repos) {
    test(`${rel} calcula el hoy en America/La_Paz`, () => {
      const sql = leer(rel);
      assert.ok(sql.includes('America/La_Paz'), 'falta HOY America/La_Paz');
      assert.ok(!sql.includes('- CURRENT_DATE') && !sql.includes('< CURRENT_DATE'), 'queda CURRENT_DATE en aritmética de fechas');
    });
  }
  test('elegible_renovacion usa BETWEEN 0 AND 30 (vencidas no eligen)', () => {
    for (const rel of ['afiliacion/afiliacion.repository.js', 'auth/auth.repository.js']) {
      assert.ok(leer(rel).includes('BETWEEN 0 AND 30'), `${rel} no cierra la ventana en 0`);
    }
  });
});
