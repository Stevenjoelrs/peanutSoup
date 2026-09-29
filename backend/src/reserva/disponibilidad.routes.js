import { Router } from 'express';
import { listarHorariosDisponibles } from './reserva.controller.js';

const router = Router();

// Consultar horarios de atención disponibles
router.get('/disponibles', listarHorariosDisponibles);

export default router;
