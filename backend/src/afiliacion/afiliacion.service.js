import { badRequest, conflict, notFound } from '../shared/http/errors.js';
import * as repo from './afiliacion.repository.js';

/**
 * CAPA DE NEGOCIO — módulo de afiliación (US-01)
 * -----------------------------------------------------------------------------
 * Aquí viven las reglas del SSU y los mensajes que forman parte del contrato
 * funcional. No importa Express: lanza DomainError y el controlador lo traduce
 * a la respuesta HTTP vigente.
 */

/** Regla de política: solo se puede renovar con 30 días o menos restantes. */
export const LIMITE_RENOVACION_DIAS = 30;

const esFechaInvalida = (valor) => Number.isNaN(new Date(valor).getTime());

/**
 * El driver `pg` devuelve las columnas DATE como objetos Date en la medianoche
 * local de ese día. Interpolar ese objeto en un mensaje produciría algo como
 * "Sun Jan 31 2027 00:00:00 GMT-0400 (Bolivia Time)", que no es un mensaje de
 * producto. Se reconstruye el calendario con los getters locales, que son
 * exactos independientemente de la zona horaria del proceso.
 */
const fechaComoTexto = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * US-01 — registrar la afiliación semestral del estudiante del token.
 */
export const registrarAfiliacion = async ({ id_estudiante, periodo_semestral, fecha_inicio, fecha_vencimiento }) => {
  if (!periodo_semestral || !fecha_inicio || !fecha_vencimiento) {
    throw badRequest('Los campos periodo_semestral, fecha_inicio y fecha_vencimiento son requeridos.');
  }

  if (esFechaInvalida(fecha_inicio) || esFechaInvalida(fecha_vencimiento)) {
    throw badRequest('Las fechas deben tener formato YYYY-MM-DD.');
  }

  if (new Date(fecha_vencimiento) < new Date(fecha_inicio)) {
    throw badRequest('La fecha de vencimiento no puede ser anterior a la fecha de inicio.');
  }

  const estudiante = await repo.buscarEstudiantePorId(id_estudiante);
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

/**
 * US-12 — Vigencia actual, días restantes y elegibilidad de renovación.
 *
 * Cuando el estudiante nunca se afilió la respuesta es 200 con
 * `tiene_afiliacion: false`: no es un error, es el estado inicial de cualquiera
 * que entra por primera vez al portal.
 */
export const consultarVigencia = async (id_estudiante) => {
  const vigente = await repo.buscarVigencia(id_estudiante);

  if (!vigente) {
    return {
      mensaje: 'El estudiante no registra afiliaciones previas.',
      data: {
        estudiante_id: id_estudiante,
        tiene_afiliacion: false,
        vigente: null,
        dias_para_vencer: null,
        limite_renovacion_dias: LIMITE_RENOVACION_DIAS,
        elegible_renovacion: false
      }
    };
  }

  const dias = parseInt(vigente.dias_para_vencer, 10);
  const inicio = new Date(vigente.fecha_inicio);
  const fin = new Date(vigente.fecha_vencimiento);
  const total = fin - inicio;
  const progreso = total > 0 ? Math.max(0, Math.min(100, Math.round(((Date.now() - inicio) / total) * 100))) : 0;

  return {
    mensaje: 'Vigencia de la afiliación consultada.',
    data: {
      estudiante_id: id_estudiante,
      tiene_afiliacion: true,
      vigente,
      dias_para_vencer: dias,
      limite_renovacion_dias: LIMITE_RENOVACION_DIAS,
      elegible_renovacion: vigente.elegible_renovacion,
      progreso_semestre_porcentaje: Number.isNaN(progreso) ? 0 : progreso
    }
  };
};

/**
 * US-12 — renovar la afiliación.
 *
 * Regla dura: solo se renueva con 30 días o menos para el vencimiento, y el
 * traspaso tiene que ser atómico. Si se cerrara la afiliación vieja antes de
 * abrir la nueva y la inserción fallara, el estudiante se quedaría sin cobertura
 * por un error ajeno.
 */
export const renovarAfiliacion = async ({
  id_estudiante,
  nuevo_periodo_semestral,
  nueva_fecha_inicio,
  nueva_fecha_vencimiento
}) => {
  if (!nuevo_periodo_semestral || !nueva_fecha_inicio || !nueva_fecha_vencimiento) {
    throw badRequest(
      'Los campos nuevo_periodo_semestral, nueva_fecha_inicio y nueva_fecha_vencimiento son obligatorios.'
    );
  }
  if (esFechaInvalida(nueva_fecha_inicio) || esFechaInvalida(nueva_fecha_vencimiento)) {
    throw badRequest('Las fechas deben tener formato YYYY-MM-DD.');
  }
  if (new Date(nueva_fecha_vencimiento) < new Date(nueva_fecha_inicio)) {
    throw badRequest('La nueva fecha de vencimiento no puede ser anterior a la fecha de inicio.');
  }

  try {
    return await repo.conTransaccion(async (client) => {
      const actual = await repo.buscarUltimaAfiliacionActiva(client, id_estudiante);
      if (!actual) {
        throw notFound('No se encontró ninguna afiliación previa para este estudiante.');
      }
      const diasRestantes = parseInt(actual.dias_para_vencer, 10);
      if (diasRestantes > LIMITE_RENOVACION_DIAS) {
        throw badRequest(
          `No procede la renovación. Faltan ${diasRestantes} días para el vencimiento (${fechaComoTexto(actual.fecha_vencimiento)}). El SSU solo permite renovar cuando restan ${LIMITE_RENOVACION_DIAS} días o menos.`,
          {
            dias_restantes: diasRestantes,
            fecha_vencimiento_actual: fechaComoTexto(actual.fecha_vencimiento),
            limite_politica_dias: LIMITE_RENOVACION_DIAS
          }
        );
      }
      await repo.inactivarAfiliacion(client, actual.id_afiliacion);
      const nueva = await repo.insertarAfiliacionConCliente(client, {
        id_estudiante,
        periodo_semestral: nuevo_periodo_semestral,
        fecha_inicio: nueva_fecha_inicio,
        fecha_vencimiento: nueva_fecha_vencimiento
      });
      return {
        mensaje: `Renovación exitosa para el periodo ${nuevo_periodo_semestral}. Cobertura extendida hasta ${nueva_fecha_vencimiento}.`,
        data: {
          estudiante: { id_estudiante: actual.id_estudiante, nombre_completo: actual.nombre_completo, sis: actual.sis },
          afiliacion_anterior: {
            id_afiliacion: actual.id_afiliacion,
            periodo_semestral: actual.periodo_semestral,
            fecha_vencimiento: actual.fecha_vencimiento,
            nuevo_estado: 'INACTIVA'
          },
          afiliacion_renovada: nueva
        }
      };
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Ya existe una afiliación registrada para el nuevo periodo semestral indicado.');
    }
    throw error;
  }
};
