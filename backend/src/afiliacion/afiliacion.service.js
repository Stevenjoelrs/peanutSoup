import { badRequest, conflict, notFound } from '../shared/http/errors.js';
import {
  calcularProgresoSemestral,
  compararFechas,
  esFechaCalendarioValida,
  evaluarVentanaRenovacion,
  hoyLaPazISO,
  normalizarFecha
} from '../shared/http/fechas.js';
import * as repo from './afiliacion.repository.js';

/**
 * CAPA DE NEGOCIO — módulo de afiliación (US-01)
 * -----------------------------------------------------------------------------
 * Aquí viven las reglas del SSU y los mensajes que forman parte del contrato
 * funcional. No importa Express: lanza DomainError y el controlador lo traduce
 * a la respuesta HTTP vigente.
 */

/**
 * Regla de política US-12: ventana de renovación cerrada de 0 a 30 días
 * restantes. Con más de 30 días no procede; vencida (días negativos)
 * corresponde afiliación nueva, no renovación.
 */
export const LIMITE_RENOVACION_DIAS = 30;

const esFechaInvalida = (valor) => !esFechaCalendarioValida(valor);

/**
 * El driver `pg` devuelve las columnas DATE como objetos Date en la medianoche
 * local de ese día. Interpolar ese objeto en un mensaje produciría algo como
 * "Sun Jan 31 2027 00:00:00 GMT-0400 (Bolivia Time)", que no es un mensaje de
 * producto. Se normaliza a calendario 'YYYY-MM-DD' (ver fechas.js).
 */
const fechaComoTexto = (valor) => normalizarFecha(valor);

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

  if (compararFechas(fecha_vencimiento, fecha_inicio) < 0) {
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
      mensaje: 'Afiliado con cobertura activa',
      data: {
        estudiante: {
          id_estudiante: estudiante.id_estudiante,
          sis: estudiante.sis,
          nombre_completo: estudiante.nombre_completo,
          carrera: estudiante.carrera,
          estado_cuenta: 'Afiliado con cobertura activa'
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
        elegible_renovacion: false,
        estado_cuenta: 'Sin afiliación registrada'
      }
    };
  }

  const dias = parseInt(vigente.dias_para_vencer, 10);
  // Avance en días calendario (America/La_Paz), no en milisegundos de
  // instante: mezclar `Date.now()` con fechas DATE desfasa el porcentaje
  // cerca de la medianoche y con zonas distintas a la del servidor.
  const progreso = calcularProgresoSemestral(
    vigente.fecha_inicio,
    vigente.fecha_vencimiento,
    hoyLaPazISO()
  );

  return {
    mensaje: 'Vigencia de la afiliación consultada.',
    data: {
      estudiante_id: id_estudiante,
      tiene_afiliacion: true,
      vigente,
      dias_para_vencer: dias,
      limite_renovacion_dias: LIMITE_RENOVACION_DIAS,
      elegible_renovacion: vigente.elegible_renovacion,
      progreso_semestre_porcentaje: Number.isNaN(progreso) ? 0 : progreso,
      estado_cuenta: vigente.estado_efectivo === 'ACTIVA'
        ? 'Afiliado con cobertura activa'
        : vigente.estado_efectivo === 'VENCIDA'
          ? 'Afiliación vencida'
          : 'Sin cobertura activa'
    }
  };
};

/**
 * US-12 — renovar la afiliación.
 *
 * Regla dura: solo se renueva dentro de la ventana cerrada de 0 a 30 días
 * para el vencimiento (vencida = afiliación nueva, no renovación), y el
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
  if (compararFechas(nueva_fecha_vencimiento, nueva_fecha_inicio) < 0) {
    throw badRequest('La nueva fecha de vencimiento no puede ser anterior a la fecha de inicio.');
  }

  try {
    return await repo.conTransaccion(async (client) => {
      const actual = await repo.buscarUltimaAfiliacionActiva(client, id_estudiante);
      if (!actual) {
        throw notFound('No se encontró ninguna afiliación previa para este estudiante.');
      }
      const diasRestantes = parseInt(actual.dias_para_vencer, 10);
      // Ventana cerrada 0-30 días (ver evaluarVentanaRenovacion en fechas.js):
      // ni muy temprano ni ya vencida.
      const ventana = evaluarVentanaRenovacion(diasRestantes, LIMITE_RENOVACION_DIAS);
      if (ventana.motivo === 'vencida') {
        throw badRequest(
          `No procede la renovación. La afiliación venció el ${fechaComoTexto(actual.fecha_vencimiento)} (hace ${Math.abs(diasRestantes)} días). Corresponde registrar una afiliación nueva, no renovar.`,
          {
            dias_restantes: diasRestantes,
            fecha_vencimiento_actual: fechaComoTexto(actual.fecha_vencimiento),
            limite_politica_dias: LIMITE_RENOVACION_DIAS
          }
        );
      }
      if (!ventana.procede) {
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
        mensaje: 'Afiliado con cobertura activa',
        data: {
          estudiante: { id_estudiante: actual.id_estudiante, nombre_completo: actual.nombre_completo, sis: actual.sis, estado_cuenta: 'Afiliado con cobertura activa' },
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
