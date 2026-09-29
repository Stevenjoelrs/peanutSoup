import { notFound, unauthorized, badRequest } from '../shared/http/errors.js';
import { generateToken } from '../shared/middleware/auth.js';
import * as repo from './auth.repository.js';

const armarAfiliacion = (est) => {
  if (!est.id_afiliacion) return null;
  const dias = est.dias_para_vencer !== null ? parseInt(est.dias_para_vencer, 10) : null;
  return {
    id_afiliacion: est.id_afiliacion,
    periodo_semestral: est.periodo_semestral,
    fecha_inicio: est.fecha_inicio,
    fecha_vencimiento: est.fecha_vencimiento,
    estado: est.estado_afiliacion,
    estado_efectivo: est.estado_afiliacion_efectivo,
    dias_para_vencer: dias,
    ...(est.elegible_renovacion !== undefined && { elegible_renovacion: est.elegible_renovacion }),
    estado_cuenta: est.estado_afiliacion_efectivo === 'ACTIVA'
      ? 'Afiliado con cobertura activa'
      : est.estado_afiliacion_efectivo === 'VENCIDA'
        ? 'Afiliación vencida'
        : 'Sin cobertura activa'
  };
};

export const autenticar = async (sis, cedula_identidad) => {
  if (!sis || !cedula_identidad) {
    throw badRequest('El código SIS y la Cédula de Identidad son obligatorios para iniciar sesión.');
  }

  const estudiante = await repo.buscarEstudiantePorCredenciales(sis.trim(), cedula_identidad.trim());

  if (!estudiante) {
    throw unauthorized('Credenciales incorrectas. Verifique su código SIS y Cédula de Identidad.');
  }

  const tokenPayload = {
    id_estudiante: estudiante.id_estudiante,
    sis: estudiante.sis,
    nombre_completo: estudiante.nombre_completo,
    facultad: estudiante.facultad,
    carrera: estudiante.carrera
  };

  const token = generateToken(tokenPayload);

  return {
    mensaje: `Inicio de sesión exitoso. Bienvenido al SSU, ${estudiante.nombre_completo}.`,
    data: {
      token,
      estudiante: {
        id_estudiante: estudiante.id_estudiante,
        sis: estudiante.sis,
        nombre_completo: estudiante.nombre_completo,
        facultad: estudiante.facultad,
        carrera: estudiante.carrera,
        afiliacion: armarAfiliacion(estudiante)
      }
    }
  };
};

export const obtenerPerfil = async (id_estudiante) => {
  const est = await repo.buscarEstudiantePorId(id_estudiante);

  if (!est) {
    throw notFound('Estudiante no encontrado.');
  }

  return {
    mensaje: 'Datos del estudiante autenticado.',
    data: {
      id_estudiante: est.id_estudiante,
      sis: est.sis,
      nombre_completo: est.nombre_completo,
      facultad: est.facultad,
      carrera: est.carrera,
      afiliacion: armarAfiliacion(est)
    }
  };
};
