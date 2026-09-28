import { badRequest, conflict, notFound } from '../shared/http/errors.js';
import * as repo from './afiliacion.repository.js';

/**
 * CAPA DE NEGOCIO — módulo de afiliación (US-01)
 * -----------------------------------------------------------------------------
 * Aquí viven las reglas del SSU y los mensajes que forman parte del contrato
 * funcional. No importa Express: lanza DomainError y el controlador lo traduce
 * a la respuesta HTTP vigente.
 */

const esFechaInvalida = (valor) => Number.isNaN(new Date(valor).getTime());

/**
 * US-01 — registrar la afiliación semestral de un estudiante del padrón.
 *
 * El estudiante llega por su matrícula (`sis`). Es provisional: en cuanto exista
 * sesión, la identidad se resolverá desde el token y esta función desaparece del
 * camino de alta.
 */
export const registrarAfiliacion = async ({ sis, periodo_semestral, fecha_inicio, fecha_vencimiento }) => {
  if (!sis) {
    throw badRequest('El campo sis es requerido.');
  }
  if (!periodo_semestral || !fecha_inicio || !fecha_vencimiento) {
    throw badRequest('Los campos periodo_semestral, fecha_inicio y fecha_vencimiento son requeridos.');
  }

  if (esFechaInvalida(fecha_inicio) || esFechaInvalida(fecha_vencimiento)) {
    throw badRequest('Las fechas deben tener formato YYYY-MM-DD.');
  }

  if (new Date(fecha_vencimiento) < new Date(fecha_inicio)) {
    throw badRequest('La fecha de vencimiento no puede ser anterior a la fecha de inicio.');
  }

  const estudiante = await repo.buscarEstudiantePorSis(sis);
  if (!estudiante) {
    throw notFound('El estudiante no se encontró en el padrón universitario.');
  }

  const existente = await repo.buscarAfiliacionActivaPorPeriodo(estudiante.id_estudiante, periodo_semestral);
  if (existente) {
    throw conflict(
      `${estudiante.nombre_completo} ya cuenta con una afiliación activa para el periodo semestral ${periodo_semestral}.`,
      {
        afiliacion_id: existente.id_afiliacion,
        periodo: periodo_semestral,
        vencimiento: existente.fecha_vencimiento
      }
    );
  }

  try {
    const afiliacion = await repo.insertarAfiliacion({
      id_estudiante: estudiante.id_estudiante,
      periodo_semestral,
      fecha_inicio,
      fecha_vencimiento
    });

    return {
      mensaje: `Afiliación semestral (${periodo_semestral}) registrada exitosamente para ${estudiante.nombre_completo}.`,
      data: {
        estudiante: {
          id_estudiante: estudiante.id_estudiante,
          sis: estudiante.sis,
          nombre_completo: estudiante.nombre_completo,
          carrera: estudiante.carrera
        },
        afiliacion
      }
    };
  } catch (error) {
    // UNIQUE (id_estudiante, periodo_semestral) de la base de datos
    if (error.code === '23505') {
      throw conflict('Ya existe una afiliación registrada para el periodo semestral indicado.');
    }
    throw error;
  }
};
