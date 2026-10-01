/**
 * SSU - UMSS | Política transversal de cobertura
 * -----------------------------------------------------------------------------
 * `requireCoberturaActiva(client, id_estudiante)` es el gate único que deben
 * llamar las escrituras que exigen afiliación vigente (reservas, derivaciones).
 * Vive en `shared/` para no acoplar dominios entre sí (reserva no importa
 * afiliación). Recibe el `client` de la transacción: SIEMPRE se llama DENTRO
 * del `conTransaccion`, como primera sentencia, para evitar TOCTOU.
 */
import { forbidden } from '../http/errors.js';
import * as repo from './cobertura.repository.js';

/**
 * Lanza 403 si el estudiante no tiene cobertura vigente hoy (America/La_Paz).
 * @returns la fila de afiliación vigente (para quien la necesite).
 */
export const requireCoberturaActiva = async (client, id_estudiante) => {
  const vigente = await repo.buscarCoberturaVigente(client, id_estudiante);

  if (vigente) return vigente;

  const ultima = await repo.describirUltimaAfiliacion(client, id_estudiante);

  if (!ultima) {
    throw forbidden('Sin afiliación registrada. Completa tu afiliación semestral para reservar fichas.', {
      estado_efectivo: 'SIN_AFILIACION',
      accion_sugerida: '/registro'
    });
  }

  const dias = Number(ultima.dias_para_vencer);
  const vencimiento = ultima.fecha_vencimiento instanceof Date
    ? ultima.fecha_vencimiento.toISOString().slice(0, 10)
    : String(ultima.fecha_vencimiento);

  if (ultima.estado === 'INACTIVA') {
    throw forbidden('Tu afiliación está inactiva. Renueva tu cobertura para reservar fichas.', {
      estado_efectivo: 'INACTIVA',
      fecha_vencimiento: vencimiento,
      dias_para_vencer: dias,
      accion_sugerida: '/renovacion'
    });
  }

  if (dias < 0) {
    throw forbidden(`Tu cobertura venció el ${vencimiento}. Renueva tu afiliación para reservar fichas.`, {
      estado_efectivo: 'VENCIDA',
      fecha_vencimiento: vencimiento,
      dias_para_vencer: dias,
      accion_sugerida: '/renovacion'
    });
  }

  throw forbidden('Tu cobertura aún no está vigente. Espera al inicio de tu periodo para reservar fichas.', {
    estado_efectivo: 'FUTURA',
    fecha_vencimiento: vencimiento,
    dias_para_vencer: dias,
    accion_sugerida: '/renovacion'
  });
};
