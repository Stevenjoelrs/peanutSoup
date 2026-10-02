import {
  badRequest,
  notFound,
  conflict,
  forbidden
} from '../shared/http/errors.js';
import * as repo from './reserva.repository.js';
import { requireCoberturaActiva } from '../shared/policies/cobertura.service.js';
import { normalizarFecha } from '../shared/http/fechas.js';

// `pg` entrega las columnas DATE como Date a medianoche local; se formatea en la
// misma zona para no correr el día al mostrarlo.
const formatearFecha = (fecha) =>
  fecha instanceof Date ? fecha.toLocaleDateString('en-CA') : String(fecha);

/**
 * Regla SSU: una sola ficha por estudiante y día, sin importar el tipo (general
 * o especialista). Bloquea la fila del estudiante antes de buscar, para que dos
 * reservas simultáneas del mismo estudiante no pasen ambas la comprobación.
 */
const verificarUnaFichaPorDia = async (client, id_estudiante, fecha) => {
  const estudiante = await repo.bloquearEstudiante(client, id_estudiante);

  if (!estudiante) {
    throw notFound('El estudiante autenticado no existe en el sistema.');
  }

  const fichaExistente = await repo.buscarFichaMismaFecha(client, id_estudiante, fecha);

  if (fichaExistente) {
    const dia = formatearFecha(fecha);
    throw conflict(
      `Ya tienes una ficha ${fichaExistente.tipo_ficha} reservada para el ${dia} a las ${String(fichaExistente.hora_inicio).slice(0, 5)}. Solo se permite una ficha por estudiante por día.`,
      { ficha_existente_id: fichaExistente.id_ficha, fecha: dia }
    );
  }

  return estudiante;
};

export const obtenerDatosComprobante = async (id_ficha, id_estudiante) => {
  if (!id_ficha) {
    throw badRequest('El identificador de la ficha es requerido.');
  }

  const ficha = await repo.obtenerComprobantePorId(id_ficha);

  if (!ficha) {
    throw notFound('La ficha solicitada no existe.');
  }

  if (ficha.id_estudiante !== id_estudiante) {
    throw forbidden('Acceso denegado. La ficha pertenece a otro estudiante.', {
      ficha_id: ficha.id_ficha
    });
  }

  return ficha;
};

export const consultarHorariosDisponibles = async (filtros) => {
  return repo.obtenerHorariosDisponibles(filtros);
};

export const reservarFichaGeneral = async (id_estudiante, id_horario) => {
  if (!id_horario) {
    throw badRequest('El campo id_horario es requerido.');
  }

  return repo.conTransaccion(async (client) => {
    await requireCoberturaActiva(client, id_estudiante);
    const horario = await repo.bloquearHorario(client, id_horario);

    if (!horario) {
      throw notFound('El horario solicitado no existe.');
    }

    if (!horario.disponible) {
      throw conflict('El horario seleccionado ya no está disponible (fue reservado recientemente).');
    }

    const estudiante = await verificarUnaFichaPorDia(client, id_estudiante, horario.fecha);

    await repo.marcarHorarioNoDisponible(client, id_horario);

    const nuevaFicha = await repo.insertarFicha(client, {
      id_estudiante,
      id_horario,
      tipo_ficha: 'GENERAL',
      estado: 'RESERVADA'
    });

    return {
      mensaje: `Ficha médica reservada exitosamente para ${estudiante.nombre_completo}.`,
      data: {
        ficha: nuevaFicha,
        atencion: {
          fecha: horario.fecha,
          hora_inicio: horario.hora_inicio,
          hora_fin: horario.hora_fin,
          consultorio: horario.consultorio,
          medico: horario.medico_nombre,
          especialidad: horario.especialidad_nombre || 'Medicina General'
        }
      }
    };
  });
};

export const reservarFichaEspecialista = async (id_estudiante, id_horario, id_derivacion) => {
  if (!id_horario || !id_derivacion) {
    throw badRequest('Los campos id_horario e id_derivacion son obligatorios para reservar con especialista.');
  }

  return repo.conTransaccion(async (client) => {
    await requireCoberturaActiva(client, id_estudiante);
    const derivacion = await repo.bloquearDerivacionEstudiante(client, id_derivacion, id_estudiante);

    if (!derivacion) {
      throw notFound('La orden de derivación no existe o no pertenece al estudiante autenticado.');
    }

    if (derivacion.estado !== 'ACTIVA') {
      throw badRequest(`La orden de derivación no está disponible. Su estado actual es '${derivacion.estado}'.`);
    }

    const horario = await repo.bloquearHorario(client, id_horario);

    if (!horario) {
      throw notFound('El horario de atención no fue encontrado.');
    }

    if (!horario.disponible) {
      throw conflict('El horario del especialista ya no está disponible.');
    }

    if (!horario.es_especialista) {
      throw badRequest(`El médico ${horario.medico_nombre} es de Medicina General. Seleccione un médico especialista.`);
    }

    if (horario.id_especialidad !== derivacion.id_especialidad_requerida) {
      throw badRequest(
        `Incongruencia de especialidad: La derivación requiere '${derivacion.especialidad_requerida_nombre}', pero el médico pertenece a '${horario.especialidad_medico_nombre}'.`
      );
    }

    await verificarUnaFichaPorDia(client, id_estudiante, horario.fecha);

    await repo.marcarDerivacionUtilizada(client, id_derivacion);
    await repo.marcarHorarioNoDisponible(client, id_horario);

    const nuevaFicha = await repo.insertarFicha(client, {
      id_estudiante,
      id_horario,
      tipo_ficha: 'ESPECIALISTA',
      estado: 'RESERVADA'
    });

    return {
      mensaje: 'Reserva con Especialista completada atómicamente. Derivación marcada como Utilizada.',
      data: {
        ficha: nuevaFicha,
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
      }
    };
  });
};

export const listarFichasPorEstudiante = async (id_estudiante) => {
  return repo.obtenerFichasPorEstudiante(id_estudiante);
};

// Margen mínimo de cancelación: el estudiante debe avisar con al menos 2 horas
// de anticipación. Pasado ese límite la cita se considera comprometida y la
// inasistencia la procesa la clínica con una falta, no con una cancelación.
const MARGEN_CANCELACION_MS = 2 * 60 * 60 * 1000;

/** Instante de la cita interpretando fecha + hora en la zona de La Paz (UTC-4). */
const instanteCita = (fecha, hora) => {
  const dia = normalizarFecha(fecha);
  if (!dia) return null;
  const horaTexto = String(hora).slice(0, 5);
  // Bolivia no tiene horario de verano: su offset es siempre UTC-4.
  const instante = new Date(`${dia}T${horaTexto}:00-04:00`);
  return Number.isNaN(instante.getTime()) ? null : instante;
};

/**
 * US-07 — cancelar una ficha. Reglas:
 *   - solo borra el compromiso del estudiante; no toca cobertura ni derivaciones;
 *   - protege la fila con FOR UPDATE para que no haya dos cancelaciones a la vez;
 *   - solo cancela fichas propias y todavía activas;
 *   - exige aviso con 2 horas de anticipación.
 * La clínica puede seguir viendo el horario como libre al momento.
 */
export const cancelarFicha = async (id_estudiante, id_ficha) => {
  if (!id_ficha) {
    throw badRequest('El campo id_ficha es requerido.');
  }

  return repo.conTransaccion(async (client) => {
    const ficha = await repo.bloquearFicha(client, id_ficha);

    if (!ficha) {
      throw notFound('La ficha no existe.');
    }

    if (ficha.id_estudiante !== id_estudiante) {
      throw forbidden('Esa ficha pertenece a otro estudiante.');
    }

    if (ficha.estado !== 'RESERVADA' && ficha.estado !== 'CONFIRMADA') {
      throw conflict(`La ficha ya no se puede cancelar (estado actual: ${ficha.estado}).`);
    }

    const cita = instanteCita(ficha.fecha, ficha.hora_inicio);
    if (!cita) {
      throw conflict('No se pudo determinar la fecha de la cita.');
    }

    if (cita.getTime() - Date.now() < MARGEN_CANCELACION_MS) {
      throw conflict('Solo puedes cancelar tu cita hasta 2 horas antes de la atención.');
    }

    const cancelada = await repo.marcarFichaCancelada(client, id_ficha);
    await repo.marcarHorarioDisponible(client, ficha.id_horario);

    return {
      mensaje: 'Tu cita fue cancelada. El horario quedó disponible nuevamente.',
      data: {
        ficha: cancelada
      }
    };
  });
};
