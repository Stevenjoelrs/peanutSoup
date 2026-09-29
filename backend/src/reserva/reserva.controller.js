import { successResponse } from '../shared/http/response.js';
import { manejar } from '../shared/http/manejar.js';
import * as servicio from './reserva.service.js';

/**
 * CAPA HTTP — módulo de reserva de fichas médicas
 * -----------------------------------------------------------------------------
 * Los controladores solo traducen HTTP <-> servicio. Toda regla de negocio
 * y transacciones atómicas viven en las capas inferiores (service y repository).
 */

const esc = (v) =>
  String(v ?? '-').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/**
 * US-03 / US-08 — Comprobante oficial de la ficha reservada
 * GET /api/fichas/:id/comprobante
 * Devuelve el comprobante en HTML imprimible. Solo el titular autenticado puede obtenerlo.
 */
export const obtenerComprobanteFicha = manejar(async (req, res) => {
  const { id } = req.params;
  const id_estudiante = req.user.id_estudiante;
  const ficha = await servicio.obtenerDatosComprobante(id, id_estudiante);

  const fechaLarga = new Date(`${ficha.fecha}T12:00:00`).toLocaleDateString('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante de ficha ${esc(ficha.id_ficha.slice(0, 8))} — SSU UMSS</title>
<style>
  body { font-family: system-ui, Arial, sans-serif; color: #131b2e; margin: 0; padding: 32px; background: #faf8ff; }
  .card { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #dae2fd; border-radius: 12px; overflow: hidden; }
  header { background: #003178; color: #fff; padding: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  header h1 { margin: 0 0 4px; font-size: 20px; }
  header p { margin: 0; opacity: .85; font-size: 13px; }
  .code { font-size: 22px; font-weight: 700; text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  .cell { padding: 14px 24px; border-top: 1px solid #eaedff; }
  .cell.full { grid-column: 1 / -1; }
  .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #737783; }
  .value { font-size: 15px; font-weight: 600; }
  .tag { display: inline-block; background: #d9e2ff; color: #001945; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
  footer { padding: 16px 24px; font-size: 12px; color: #737783; border-top: 1px solid #eaedff; }
  .actions { max-width: 820px; margin: 16px auto 0; display: flex; gap: 10px; }
  button { background: #003178; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .actions { display: none; } }
</style>
</head>
<body>
  <div class="card">
    <header>
      <div>
        <h1>Comprobante de Ficha Médica</h1>
        <p>Seguro Social Universitario · Universidad Mayor de San Simón</p>
      </div>
      <div>
        <div class="code">FICHA #${esc(ficha.id_ficha.slice(0, 8).toUpperCase())}</div>
        <div style="text-align:right"><span class="tag">${esc(ficha.tipo_ficha)}</span></div>
      </div>
    </header>
    <div class="grid">
      <div class="cell full"><span class="label">Estudiante asegurado</span><span class="value">${esc(ficha.estudiante_nombre)} — SIS ${esc(ficha.estudiante_sis)}</span></div>
      <div class="cell"><span class="label">Facultad / Carrera</span><span class="value">${esc(ficha.facultad)}</span></div>
      <div class="cell"><span class="label">Carrera</span><span class="value">${esc(ficha.carrera)}</span></div>
      <div class="cell"><span class="label">Profesional tratante</span><span class="value">${esc(ficha.medico_nombre)}</span></div>
      <div class="cell"><span class="label">Especialidad</span><span class="value">${esc(ficha.especialidad_nombre || 'Medicina General')}</span></div>
      <div class="cell"><span class="label">Consultorio</span><span class="value">${esc(ficha.consultorio)}</span></div>
      <div class="cell"><span class="label">Estado de la ficha</span><span class="value">${esc(ficha.estado)}</span></div>
      <div class="cell full"><span class="label">Fecha y hora de atención</span><span class="value">${esc(fechaLarga)} · ${esc(String(ficha.hora_inicio).slice(0, 5))} a ${esc(String(ficha.hora_fin).slice(0, 5))}</span></div>
      <div class="cell full"><span class="label">Emitida</span><span class="value">${esc(new Date(ficha.fecha_reserva).toLocaleString('es-BO'))}</span></div>
    </div>
    <footer>Presentar este comprobante en ventanilla junto con su cédula de identidad. Válido únicamente para el titular.</footer>
  </div>
  <div class="actions">
    <button type="button" onclick="window.print()">Descargar / Imprimir PDF</button>
  </div>
  ${req.query.auto === '1' ? '<script>window.addEventListener("load", () => window.print());</script>' : ''}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
});

/**
 * Consultar horarios de atención disponibles
 * Ruta pública — no requiere autenticación
 */
export const listarHorariosDisponibles = manejar(async (req, res) => {
  const horarios = await servicio.consultarHorariosDisponibles(req.query);
  return successResponse(res, 'Horarios de atención disponibles obtenidos.', horarios);
});

/**
 * US-03 — Reserva de Ficha Médica (Medicina General)
 * id_estudiante extraído del JWT autenticado (req.user).
 */
export const reservarFichaGeneral = manejar(async (req, res) => {
  const id_estudiante = req.user.id_estudiante;
  const { id_horario } = req.body;
  const { mensaje, data } = await servicio.reservarFichaGeneral(id_estudiante, id_horario);
  return successResponse(res, mensaje, data, 201);
});

/**
 * US-08 — Reserva con Especialista (Transacción Atómica SQL)
 * id_estudiante extraído del JWT autenticado (req.user).
 */
export const reservarFichaEspecialista = manejar(async (req, res) => {
  const id_estudiante = req.user.id_estudiante;
  const { id_horario, id_derivacion } = req.body;
  const { mensaje, data } = await servicio.reservarFichaEspecialista(id_estudiante, id_horario, id_derivacion);
  return successResponse(res, mensaje, data, 201);
});

/**
 * Listar fichas reservadas del estudiante autenticado
 */
export const listarFichasPorEstudiante = manejar(async (req, res) => {
  const id_estudiante = req.user.id_estudiante;
  const fichas = await servicio.listarFichasPorEstudiante(id_estudiante);
  return successResponse(res, 'Fichas del estudiante autenticado recuperadas.', fichas);
});
