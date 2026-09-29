import { query, getClient } from '../shared/config/db.js';
import { successResponse, errorResponse } from '../shared/http/response.js';

/**
 * US-03 / US-08 — Comprobante oficial de la ficha reservada
 * GET /api/fichas/:id/comprobante
 *
 * Devuelve el comprobante en HTML imprimible (el navegador lo convierte a PDF).
 * Solo el titular autenticado de la ficha puede obtenerlo (control de titularidad).
 */
export const obtenerComprobanteFicha = async (req, res, next) => {
  try {
    const { id } = req.params;
    const id_estudiante = req.user.id_estudiante;

    const result = await query(
      `SELECT f.id_ficha, f.id_estudiante, f.id_horario, f.tipo_ficha, f.estado, f.fecha_reserva,
              h.fecha, h.hora_inicio, h.hora_fin, h.consultorio,
              m.nombre_completo AS medico_nombre, m.es_especialista,
              esp.nombre AS especialidad_nombre,
              e.nombre_completo AS estudiante_nombre, e.sis AS estudiante_sis,
              e.facultad, e.carrera
       FROM fichas_reservadas f
       JOIN horarios_atencion h ON f.id_horario = h.id_horario
       JOIN medicos m ON h.id_medico = m.id_medico
       LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
       JOIN estudiantes e ON f.id_estudiante = e.id_estudiante
       WHERE f.id_ficha = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'La ficha solicitada no existe.', 404);
    }

    const ficha = result.rows[0];

    if (ficha.id_estudiante !== id_estudiante) {
      return errorResponse(
        res,
        'Acceso denegado. La ficha pertenece a otro estudiante.',
        403,
        { ficha_id: ficha.id_ficha }
      );
    }

    const esc = (v) =>
      String(v ?? '-').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
      );

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
  ${req.query.auto === '1' ? '<script>window.addEventListener("load", () => window.print());<\/script>' : ''}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (error) {
    next(error);
  }
};

/**
 * Consultar horarios de atención disponibles
 * Ruta pública — no requiere autenticación
 */
export const listarHorariosDisponibles = async (req, res, next) => {
  try {
    const { solo_especialistas, id_especialidad, fecha } = req.query;

    let sql = `
      SELECT h.id_horario, h.id_medico, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio, h.disponible,
             m.nombre_completo AS medico_nombre, m.es_especialista,
             m.id_especialidad, esp.nombre AS especialidad_nombre
      FROM horarios_atencion h
      JOIN medicos m ON h.id_medico = m.id_medico
      LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
      WHERE h.disponible = TRUE
        AND h.fecha >= CURRENT_DATE
    `;
    const params = [];

    if (solo_especialistas === 'true') {
      params.push(true);
      sql += ` AND m.es_especialista = $${params.length}`;
    } else if (solo_especialistas === 'false') {
      params.push(false);
      sql += ` AND m.es_especialista = $${params.length}`;
    }

    if (id_especialidad) {
      params.push(id_especialidad);
      sql += ` AND m.id_especialidad = $${params.length}`;
    }

    if (fecha) {
      params.push(fecha);
      sql += ` AND h.fecha = $${params.length}`;
    }

    sql += ` ORDER BY h.fecha ASC, h.hora_inicio ASC`;

    const result = await query(sql, params);
    return successResponse(res, 'Horarios de atención disponibles obtenidos.', result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * US-03 — Reserva de Ficha Médica (Medicina General)
 * id_estudiante extraído del JWT autenticado (req.user).
 * Prevención SQL: un estudiante no puede tener dos fichas en la misma fecha.
 * tipo_ficha = 'GENERAL' y estado = 'RESERVADA' (vocabulario de la base de datos).
 */
export const reservarFichaGeneral = async (req, res, next) => {
  const client = await getClient();
  try {
    // id_estudiante desde el token JWT autenticado
    const id_estudiante = req.user.id_estudiante;
    const { id_horario } = req.body;

    if (!id_horario) {
      return errorResponse(res, 'El campo id_horario es requerido.', 400);
    }

    await client.query('BEGIN');

    // 1. Validar y bloquear el horario seleccionado
    // FOR UPDATE OF h: bloquea solo horarios_atencion (el LEFT JOIN de
    // especialidades es la parte nullable y no admite bloqueo de fila)
    const horarioResult = await client.query(
      `SELECT h.id_horario, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio, h.disponible,
              m.nombre_completo AS medico_nombre, m.es_especialista, esp.nombre AS especialidad_nombre
       FROM horarios_atencion h
       JOIN medicos m ON h.id_medico = m.id_medico
       LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
       WHERE h.id_horario = $1
       FOR UPDATE OF h`,
      [id_horario]
    );

    if (horarioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'El horario solicitado no existe.', 404);
    }

    const horario = horarioResult.rows[0];

    if (!horario.disponible) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'El horario seleccionado ya no está disponible (fue reservado recientemente).', 409);
    }

    // 2. Confirmar existencia del estudiante autenticado
    const estudianteResult = await client.query(
      `SELECT id_estudiante, sis, nombre_completo FROM estudiantes WHERE id_estudiante = $1`,
      [id_estudiante]
    );

    if (estudianteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'El estudiante autenticado no existe en el sistema.', 404);
    }

    const estudiante = estudianteResult.rows[0];

    // 3. PREVENCIÓN ESTRICTA EN SQL: verificar que el estudiante no tenga otra ficha el mismo día
    //    Solo una ficha cancelada por el usuario libera el día (CANCELADA_USUARIO)
    const fichaExistenteMismaFecha = await client.query(
      `SELECT f.id_ficha, f.tipo_ficha, f.estado, h.fecha, h.hora_inicio
       FROM fichas_reservadas f
       JOIN horarios_atencion h ON f.id_horario = h.id_horario
       WHERE f.id_estudiante = $1
         AND h.fecha = $2
         AND f.estado <> 'CANCELADA_USUARIO'
       FOR UPDATE`,
      [id_estudiante, horario.fecha]
    );

    if (fichaExistenteMismaFecha.rows.length > 0) {
      await client.query('ROLLBACK');
      const fichaDuplicada = fichaExistenteMismaFecha.rows[0];
      return errorResponse(
        res,
        `Regla SSU: ${estudiante.nombre_completo} ya tiene una ficha reservada (${fichaDuplicada.tipo_ficha}) para el ${horario.fecha} a las ${fichaDuplicada.hora_inicio}. Solo se permite una ficha por estudiante por día.`,
        409,
        { ficha_existente_id: fichaDuplicada.id_ficha, fecha: horario.fecha }
      );
    }

    // 4. Cambiar disponible = false en horarios_atencion
    await client.query(
      `UPDATE horarios_atencion SET disponible = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id_horario = $1`,
      [id_horario]
    );

    // 5. Insertar en fichas_reservadas
    const insertResult = await client.query(
      `INSERT INTO fichas_reservadas (id_estudiante, id_horario, tipo_ficha, estado)
       VALUES ($1, $2, 'GENERAL', 'RESERVADA')
       RETURNING id_ficha, id_estudiante, id_horario, tipo_ficha, estado, fecha_reserva`,
      [id_estudiante, id_horario]
    );

    await client.query('COMMIT');

    return successResponse(
      res,
      `Ficha médica reservada exitosamente para ${estudiante.nombre_completo}.`,
      {
        ficha: insertResult.rows[0],
        atencion: {
          fecha: horario.fecha,
          hora_inicio: horario.hora_inicio,
          hora_fin: horario.hora_fin,
          consultorio: horario.consultorio,
          medico: horario.medico_nombre,
          especialidad: horario.especialidad_nombre || 'Medicina General'
        }
      },
      201
    );
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * US-08 — Reserva con Especialista (Transacción Atómica SQL)
 * id_estudiante extraído del JWT autenticado.
 * Filtra las ordenes_derivacion pertenecientes ÚNICAMENTE al estudiante logueado.
 * Ejecuta BEGIN / COMMIT / ROLLBACK atómico con bloqueo pesimista FOR UPDATE.
 */
export const reservarFichaEspecialista = async (req, res, next) => {
  const client = await getClient();
  try {
    // id_estudiante desde el token JWT — no puede ser manipulado desde el body
    const id_estudiante = req.user.id_estudiante;
    const { id_horario, id_derivacion } = req.body;

    if (!id_horario || !id_derivacion) {
      return errorResponse(
        res,
        'Los campos id_horario e id_derivacion son obligatorios para reservar con especialista.',
        400
      );
    }

    // INICIO DE TRANSACCIÓN ATÓMICA SQL (BEGIN)
    await client.query('BEGIN');

    // 1. Validar y bloquear la orden de derivación — filtrando SOLO las del estudiante autenticado
    // FOR UPDATE OF d: bloquea solo ordenes_derivacion (el LEFT JOIN de
    // especialidades es la parte nullable y no admite bloqueo de fila)
    const derivacionResult = await client.query(
      `SELECT d.id_derivacion, d.id_estudiante, d.estado, d.fecha_emision, d.id_especialidad_requerida,
              esp.nombre AS especialidad_requerida_nombre,
              e.nombre_completo AS estudiante_nombre
       FROM ordenes_derivacion d
       LEFT JOIN especialidades esp ON d.id_especialidad_requerida = esp.id_especialidad
       JOIN estudiantes e ON d.id_estudiante = e.id_estudiante
       WHERE d.id_derivacion = $1
         AND d.id_estudiante = $2
       FOR UPDATE OF d`,
      [id_derivacion, id_estudiante]
    );

    if (derivacionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        res,
        'La orden de derivación no existe o no pertenece al estudiante autenticado.',
        404
      );
    }

    const derivacion = derivacionResult.rows[0];

    if (derivacion.estado !== 'ACTIVA') {
      await client.query('ROLLBACK');
      return errorResponse(
        res,
        `La orden de derivación no está disponible. Su estado actual es '${derivacion.estado}'.`,
        400
      );
    }

    // 2. Validar y bloquear el horario del especialista
    const horarioResult = await client.query(
      `SELECT h.id_horario, h.id_medico, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio, h.disponible,
              m.nombre_completo AS medico_nombre, m.es_especialista, m.id_especialidad,
              esp.nombre AS especialidad_medico_nombre
       FROM horarios_atencion h
       JOIN medicos m ON h.id_medico = m.id_medico
       LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
       WHERE h.id_horario = $1
       FOR UPDATE OF h`,
      [id_horario]
    );

    if (horarioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'El horario de atención no fue encontrado.', 404);
    }

    const horario = horarioResult.rows[0];

    if (!horario.disponible) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'El horario del especialista ya no está disponible.', 409);
    }

    if (!horario.es_especialista) {
      await client.query('ROLLBACK');
      return errorResponse(
        res,
        `El médico ${horario.medico_nombre} es de Medicina General. Seleccione un médico especialista.`,
        400
      );
    }

    if (horario.id_especialidad !== derivacion.id_especialidad_requerida) {
      await client.query('ROLLBACK');
      return errorResponse(
        res,
        `Incongruencia de especialidad: La derivación requiere '${derivacion.especialidad_requerida_nombre}', pero el médico pertenece a '${horario.especialidad_medico_nombre}'.`,
        400
      );
    }

    // 3. Prevenir doble cita el mismo día
    const fichaMismaFecha = await client.query(
      `SELECT f.id_ficha FROM fichas_reservadas f
       JOIN horarios_atencion h ON f.id_horario = h.id_horario
       WHERE f.id_estudiante = $1 AND h.fecha = $2 AND f.estado <> 'CANCELADA_USUARIO'
       FOR UPDATE`,
      [id_estudiante, horario.fecha]
    );

    if (fichaMismaFecha.rows.length > 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        res,
        `Ya existe una ficha médica asignada para el ${horario.fecha}. No se permiten dos fichas el mismo día.`,
        409
      );
    }

    // 4a. Consumir la derivación ('UTILIZADA')
    await client.query(
      `UPDATE ordenes_derivacion SET estado = 'UTILIZADA' WHERE id_derivacion = $1`,
      [id_derivacion]
    );

    // 4b. Marcar horario como no disponible
    await client.query(
      `UPDATE horarios_atencion SET disponible = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id_horario = $1`,
      [id_horario]
    );

    // 4c. Crear ficha tipo 'ESPECIALISTA'
    const nuevaFichaResult = await client.query(
      `INSERT INTO fichas_reservadas (id_estudiante, id_horario, tipo_ficha, estado)
       VALUES ($1, $2, 'ESPECIALISTA', 'RESERVADA')
       RETURNING id_ficha, id_estudiante, id_horario, tipo_ficha, estado, fecha_reserva`,
      [id_estudiante, id_horario]
    );

    // COMMIT de la Transacción Atómica
    await client.query('COMMIT');

    return successResponse(
      res,
      `Reserva con Especialista completada atómicamente. Derivación marcada como Utilizada.`,
      {
        ficha: nuevaFichaResult.rows[0],
        derivacion_actualizada: {
          id_derivacion: derivacion.id_derivacion,
          estado_nuevo: 'Utilizada',
          especialidad: derivacion.especialidad_requerida_nombre
        },
        atencion: {
          fecha: horario.fecha,
          hora_inicio: horario.hora_inicio,
          hora_fin: horario.hora_fin,
          consultorio: horario.consultorio,
          especialista: horario.medico_nombre,
          especialidad: horario.especialidad_medico_nombre
        }
      },
      201
    );
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Listar fichas reservadas del estudiante autenticado
 */
export const listarFichasPorEstudiante = async (req, res, next) => {
  try {
    // Siempre usa el id del estudiante autenticado, ignorando params de URL
    const id_estudiante = req.user.id_estudiante;

    const result = await query(
      `SELECT f.id_ficha, f.tipo_ficha, f.estado, f.fecha_reserva,
              h.id_horario, h.fecha, h.hora_inicio, h.hora_fin, h.consultorio,
              m.nombre_completo AS medico_nombre, m.es_especialista,
              COALESCE(esp.nombre, 'Medicina General') AS especialidad_nombre
       FROM fichas_reservadas f
       JOIN horarios_atencion h ON f.id_horario = h.id_horario
       JOIN medicos m ON h.id_medico = m.id_medico
       LEFT JOIN especialidades esp ON m.id_especialidad = esp.id_especialidad
       WHERE f.id_estudiante = $1
       ORDER BY h.fecha DESC, h.hora_inicio DESC`,
      [id_estudiante]
    );

    return successResponse(res, 'Fichas del estudiante autenticado recuperadas.', result.rows);
  } catch (error) {
    next(error);
  }
};
