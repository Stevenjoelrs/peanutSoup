import {
  obtenerOrdenesLaboratorioPorEstudiante,
  obtenerOrdenLaboratorioPorId,
  informeDisponible
} from './laboratorio.service.js';

export const listarOrdenesLaboratorio = async (req, res, next) => {
  try {
    const estudianteId = req.user?.id_estudiante;
    if (!estudianteId) {
      return res.status(401).json({ success: false, message: 'No autorizado. Falta identificación del estudiante.' });
    }

    const ordenes = await obtenerOrdenesLaboratorioPorEstudiante(estudianteId);
    return res.status(200).json({ success: true, data: ordenes });
  } catch (error) {
    next(error);
  }
};

export const descargarInformeLaboratorio = async (req, res, next) => {
  try {
    const estudianteId = req.user?.id_estudiante;
    const { id } = req.params;

    if (!estudianteId) {
      return res.status(401).json({ success: false, message: 'No autorizado. Falta identificación del estudiante.' });
    }

    const orden = await obtenerOrdenLaboratorioPorId(id, estudianteId);

    if (!orden) {
      return res.status(404).json({ success: false, message: 'Orden de laboratorio no encontrada o no pertenece al estudiante.' });
    }

    const estado = String(orden.estado ?? '').toLocaleLowerCase('es');
    if (estado !== 'completado' && estado !== 'terminado') {
      return res.status(400).json({ success: false, message: 'El informe de laboratorio aún no está disponible para descarga.' });
    }

    if (!orden.enlace_informe) {
      return res.status(404).json({ success: false, message: 'La orden terminó, pero todavía no tiene un informe asociado.' });
    }

    if (!(await informeDisponible(orden.enlace_informe))) {
      return res.status(404).json({ success: false, message: 'El archivo del informe no está disponible en este momento.' });
    }

    return res.status(200).json({
      success: true,
      mensaje: 'Informe listo para descarga',
      data: {
        id: orden.id,
        codigo: orden.codigo || `LAB-${String(orden.fecha_orden).slice(0, 4)}-${String(orden.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        medicoSolicitante: orden.medico_solicitante,
        enlaceInforme: orden.enlace_informe,
        fechaResultado: orden.fecha_orden
      }
    });
  } catch (error) {
    next(error);
  }
};