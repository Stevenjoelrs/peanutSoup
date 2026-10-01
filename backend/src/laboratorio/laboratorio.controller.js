import { obtenerOrdenesLaboratorioPorEstudiante, obtenerOrdenLaboratorioPorId } from './laboratorio.service.js';

export const listarOrdenesLaboratorio = async (req, res, next) => {
  try {
    const estudianteId = req.student?.id || req.user?.id;
    if (!estudianteId) {
      return res.status(401).json({ error: 'No autorizado. Falta identificación del estudiante.' });
    }

    const ordenes = await obtenerOrdenesLaboratorioPorEstudiante(estudianteId);
    return res.status(200).json({ success: true, data: ordenes });
  } catch (error) {
    next(error);
  }
};

export const descargarInformeLaboratorio = async (req, res, next) => {
  try {
    const estudianteId = req.student?.id || req.user?.id;
    const { id } = req.params;

    if (!estudianteId) {
      return res.status(401).json({ error: 'No autorizado. Falta identificación del estudiante.' });
    }

    const orden = await obtenerOrdenLaboratorioPorId(id, estudianteId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de laboratorio no encontrada o no pertenece al estudiante.' });
    }

    if (orden.estado !== 'Completado' && orden.estado !== 'Terminado') {
      return res.status(400).json({ error: 'El informe de laboratorio aún no está disponible para descarga.' });
    }

    return res.status(200).json({
      success: true,
      mensaje: 'Informe listo para descarga',
      data: {
        id: orden.id,
        codigo: orden.codigo || `LAB-${orden.id}`,
        enlaceInforme: orden.enlace_informe || orden.resultado_url || '#',
        fechaResultado: orden.fecha_resultado || orden.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};