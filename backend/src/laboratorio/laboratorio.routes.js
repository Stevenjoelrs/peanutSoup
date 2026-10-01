import { Router } from 'express';
import { listarOrdenesLaboratorio, descargarInformeLaboratorio } from './laboratorio.controller.js';
import { authenticateStudent, requireAuth } from '../shared/middleware/auth.js';

const router = Router();

// Todas las rutas de laboratorio requieren autenticación de estudiante
router.use(authenticateStudent, requireAuth);

// HU-13: la ruta original queda como alias compatible.
router.get('/ordenes', listarOrdenesLaboratorio);
router.get('/', listarOrdenesLaboratorio);

// US-13: Endpoint seguro para descargar/obtener el informe de una orden específica
router.get('/ordenes/:id/descargar-informe', descargarInformeLaboratorio);

export default router;