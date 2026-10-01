import { Router } from 'express';
import { listarOrdenesLaboratorio, descargarInformeLaboratorio } from './laboratorio.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// Todas las rutas de laboratorio requieren autenticación de estudiante
router.use(authenticateStudent, requireAuth);

// US-13: Obtener órdenes de laboratorio del estudiante autenticado
router.get('/', listarOrdenesLaboratorio);

// US-13: Endpoint seguro para descargar/obtener el informe de una orden específica
router.get('/ordenes/:id/descargar-informe', descargarInformeLaboratorio);

export default router;