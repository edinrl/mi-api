import express from 'express';
const router = express.Router();
import * as convocatoriasController from '../controllers/convocatorias.js';

router.post('/', convocatoriasController.crearConvocatoria);
router.get('/', convocatoriasController.obtenerConvocatorias);
router.get('/:id', convocatoriasController.obtenerConvocatoriaPorId);
router.put('/:id', convocatoriasController.actualizarConvocatoria);
router.delete('/:id', convocatoriasController.eliminarConvocatoria);
router.get('/:id/pdf', convocatoriasController.downloadConvocatoriaPdf);
router.get('/:id/verificar-deshabilitada', convocatoriasController.verificarConvocatoriaDeshabilitada);

export default router;
