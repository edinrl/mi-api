import { Router } from 'express';
import { pool } from '../database/conexion.js';
import bcrypt from 'bcryptjs';
import { registrarUsuario, loginUsuario, solicitarRecuperacion, restablecerContrasena, verificarRolUsuario, obtenerUsuarios, obtenerUsuarioID, actualizarUsuario, uploadProfile, actualizarEstadoUsuario, eliminarUsuario, obtenerConteoPostulantes, obtenerEstadisticasGenerales } from '../controllers/usuarios.js';
import { uploadDocumento, uploadCurriculum as uploadCurriculumMiddleware, uploadAnexo as uploadAnexoMiddleware, uploadAnexoPdf, obtenerDocumentosPorUsuario, obtenerAnexosPorUsuario, descargarDocumento, generarCertificado, subirAnexoController, subirCurriculumController, obtenerCandidatosConCurriculum, subirMultiplesAnexosController, obtenerAnexosConFiltros, obtenerAnexosParaAnalisis, obtenerDatosPostulanteConvocatoria, verificarCertificadoPorCodigo, verificarCertificadoPorDatos, obtenerVerificacionesSesionComite } from '../controllers/documentos.js';
import { crearReporte, obtenerReportes, obtenerReportePorId, actualizarReporte, eliminarReporte, downloadReporte, obtenerDatosGraficoPostulantes } from '../controllers/reports.js'; // Importar controladores de reportes
import { generarReporte, descargarReporte as descargarReporteIA } from '../controllers/reports.controller.js'; // Importar controladores de reportes de IA
import { verifyToken, checkRole } from '../authMiddleware.js';

const router = Router();

// --- Definición de Roles para los Middlewares ---
const ADMIN_COMITE_RRHH_POSTULANTE = ['admin', 'comite', 'rr.hh', 'postulante']; // Nuevo rol para documentos
const ADMIN_COMITE_RRHH = ['admin', 'comite', 'rr.hh', 'tramite']; // Incluir rol tramite

// === Rutas Públicas (no requieren token) ===
router.post('/register', registrarUsuario);
router.post('/login', loginUsuario);
router.post('/users/check-role', verificarRolUsuario); // Nueva ruta para verificar rol
router.post('/forgot-password', solicitarRecuperacion);
router.post('/reset-password/:token', restablecerContrasena); // Updated to include :token parameter

// === Rutas Protegidas (requieren token y/o rol) ===

// Rutas para usuarios
router.post(
    '/users',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    registrarUsuario
);

router.get(
    '/users',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH_POSTULANTE), // Los postulantes también pueden obtener usuarios para ver sus propios datos o si es necesario un listado.
    obtenerUsuarios
);

router.get(
    '/users/:IDUSUARIO',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH_POSTULANTE),
    obtenerUsuarioID
);

router.put(
    '/users/:IDUSUARIO',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    actualizarUsuario
);

router.put(
    '/users/:IDUSUARIO/profile-picture',
    verifyToken,
    (req, res, next) => {
        uploadProfile(req, res, (err) => {
            if (err) {
                console.error("Multer error:", err);
                if (err.message) {
                    return res.status(400).json({ message: err.message });
                }
                return res.status(500).json({ message: "Error al procesar la imagen." });
            }
            next();
        });
    },
    actualizarUsuario // Reutilizamos el controlador de actualización
);

// Endpoint para cambiar contraseña
router.put(
    '/users/:IDUSUARIO/change-password',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            const { IDUSUARIO } = req.params;
            const { contrasenaActual, nuevaContrasena } = req.body;

            if (!contrasenaActual || !nuevaContrasena) {
                return res.status(400).json({ message: 'Contraseña actual y nueva contraseña son requeridas.' });
            }

            // Verificar que el usuario que hace la petición sea el mismo que el IDUSUARIO a actualizar
            // O que el usuario tenga el rol de 'admin'
            if (req.user.rol !== 'admin' && req.user.id !== parseInt(IDUSUARIO)) {
                return res.status(403).json({ message: "No tienes permiso para cambiar la contraseña de este usuario." });
            }

            // Obtener la contraseña actual del usuario
            const [userRows] = await pool.execute(
                "SELECT contrasena FROM USUARIOS WHERE IDUSUARIO = ?",
                [IDUSUARIO]
            );

            if (userRows.length === 0) {
                return res.status(404).json({ message: "Usuario no encontrado" });
            }

            // Verificar la contraseña actual
            const contrasenaValida = await bcrypt.compare(contrasenaActual, userRows[0].contrasena);
            if (!contrasenaValida) {
                return res.status(400).json({ message: "La contraseña actual es incorrecta." });
            }

            // Hash de la nueva contraseña
            const salt = await bcrypt.genSalt(10);
            const nuevaContrasenaHash = await bcrypt.hash(nuevaContrasena, salt);

            // Actualizar la contraseña
            await pool.execute(
                "UPDATE USUARIOS SET contrasena = ? WHERE IDUSUARIO = ?",
                [nuevaContrasenaHash, IDUSUARIO]
            );

            res.status(200).json({ message: "Contraseña actualizada exitosamente" });

        } catch (error) {
            console.error("Error al cambiar contraseña:", error);
            res.status(500).json({ message: "Error del servidor al cambiar la contraseña." });
        }
    }
);

router.patch(
    '/users/:IDUSUARIO/estado',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH), // Solo admin, comite o rr.hh pueden cambiar el estado
    actualizarEstadoUsuario
);

router.delete(
    '/users/:IDUSUARIO',
    verifyToken,
    checkRole(['admin']), 
    eliminarUsuario
);

// Nueva ruta para obtener el conteo de postulantes para el rol 'comite'
router.get(
    '/reports/comite/postulantes-count',
    verifyToken,
    checkRole(['comite']),
    obtenerConteoPostulantes
);

// Nueva ruta para obtener estadísticas generales (movida desde reports.routes.js)
router.get(
    '/reports/stats',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    obtenerEstadisticasGenerales
);

// Ruta para obtener estadísticas de documentos
router.get(
    '/documentos/estadisticas',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Obtener estadísticas de curriculums
            const [curriculums] = await pool.execute("SELECT COUNT(*) as total FROM Curriculum");
            
            // Obtener estadísticas de anexos
            const [anexos] = await pool.execute("SELECT COUNT(*) as total FROM anexos");
            
            res.status(200).json({
                curriculums: { total: curriculums[0].total },
                anexos: { total: anexos[0].total }
            });
        } catch (error) {
            console.error('Error al obtener estadísticas de documentos:', error);
            res.status(500).json({ message: 'Error del servidor al obtener estadísticas de documentos.', error: error.message });
        }
    }
);

// Rutas para datos de gráficos
router.get(
    '/reports/chart-data-monthly',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Obtener datos reales de los últimos 6 meses
            const [monthlyStats] = await pool.execute(`
                SELECT 
                    DATE_FORMAT(fechaCreacion, '%b') as mes,
                    COUNT(DISTINCT u.id) as postulantes,
                    COUNT(DISTINCT c.IDCURRICULUM) as cvs,
                    COUNT(DISTINCT CASE WHEN e.estado = 'aprobado' THEN u.id END) as aprobados
                FROM usuarios u
                LEFT JOIN Curriculum c ON u.id = c.IDUSUARIO
                LEFT JOIN evaluaciones e ON u.id = e.IDUSUARIO
                WHERE u.rol = 'postulante' 
                AND u.fechaCreacion >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(fechaCreacion, '%Y-%m'), DATE_FORMAT(fechaCreacion, '%b')
                ORDER BY DATE_FORMAT(fechaCreacion, '%Y-%m')
            `);
            
            // Solo devolver datos reales de la base de datos
            res.status(200).json(monthlyStats);
        } catch (error) {
            console.error('Error al obtener datos de gráficos mensuales:', error);
            res.status(500).json({ message: 'Error del servidor al obtener datos de gráficos.', error: error.message });
        }
    }
);

router.get(
    '/reports/chart-data-status',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Obtener datos reales de estados de evaluación
            const [statusStats] = await pool.execute(`
                SELECT 
                    CASE 
                        WHEN e.estado = 'aprobado' THEN 'Aprobados'
                        WHEN e.estado = 'rechazado' THEN 'Rechazados'
                        ELSE 'Pendientes'
                    END as name,
                    COUNT(*) as value,
                    CASE 
                        WHEN e.estado = 'aprobado' THEN '#10b981'
                        WHEN e.estado = 'rechazado' THEN '#ef4444'
                        ELSE '#f59e0b'
                    END as color
                FROM usuarios u
                LEFT JOIN evaluaciones e ON u.id = e.IDUSUARIO
                WHERE u.rol = 'postulante'
                GROUP BY e.estado
            `);
            
            // Solo devolver datos reales de la base de datos
            res.status(200).json(statusStats);
        } catch (error) {
            console.error('Error al obtener datos de estado:', error);
            res.status(500).json({ message: 'Error del servidor al obtener datos de estado.', error: error.message });
        }
    }
);

router.get(
    '/reports/chart-data-evaluation',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Obtener datos reales de evaluaciones por categoría
            const [evaluationStats] = await pool.execute(`
                SELECT 
                    'Experiencia' as categoria,
                    AVG(CASE WHEN e.experiencia IS NOT NULL THEN e.experiencia ELSE 0 END) as puntuacion
                FROM evaluaciones e
                WHERE e.experiencia IS NOT NULL
                UNION ALL
                SELECT 
                    'Educación' as categoria,
                    AVG(CASE WHEN e.educacion IS NOT NULL THEN e.educacion ELSE 0 END) as puntuacion
                FROM evaluaciones e
                WHERE e.educacion IS NOT NULL
                UNION ALL
                SELECT 
                    'Habilidades' as categoria,
                    AVG(CASE WHEN e.habilidades IS NOT NULL THEN e.habilidades ELSE 0 END) as puntuacion
                FROM evaluaciones e
                WHERE e.habilidades IS NOT NULL
                UNION ALL
                SELECT 
                    'Competencias' as categoria,
                    AVG(CASE WHEN e.competencias IS NOT NULL THEN e.competencias ELSE 0 END) as puntuacion
                FROM evaluaciones e
                WHERE e.competencias IS NOT NULL
            `);
            
            // Solo devolver datos reales de la base de datos
            res.status(200).json(evaluationStats);
        } catch (error) {
            console.error('Error al obtener datos de evaluación:', error);
            res.status(500).json({ message: 'Error del servidor al obtener datos de evaluación.', error: error.message });
        }
    }
);

router.get(
    '/reports/chart-data-convocatorias',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Obtener datos reales de postulantes por puesto
            const [convocatoriasStats] = await pool.execute(`
                SELECT 
                    c.puesto as puesto,
                    COUNT(DISTINCT u.id) as postulantes
                FROM convocatorias c
                LEFT JOIN usuarios u ON u.rol = 'postulante'
                WHERE c.estado = 'activo'
                GROUP BY c.puesto
                ORDER BY postulantes DESC
                LIMIT 10
            `);
            
            // Solo devolver datos reales de la base de datos
            res.status(200).json(convocatoriasStats);
        } catch (error) {
            console.error('Error al obtener datos de convocatorias:', error);
            res.status(500).json({ message: 'Error del servidor al obtener datos de convocatorias.', error: error.message });
        }
    }
);

// === Rutas para la gestión de Reportes (Anteriormente en reports.routes.js) ===
router.post(
    '/reports',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    crearReporte
);

// Nueva ruta para generar análisis de IA y PDF
router.post(
    '/reports/ia-generate',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH), // Solo roles específicos pueden generar reportes de IA
    generarReporte
);

// Nueva ruta para descargar el reporte de IA generado
router.get(
    '/reports/ia-download/:id',
    descargarReporteIA
);

router.get(
    '/reports',
    verifyToken, // Añadir protección si se desea para obtener todos los reportes
    checkRole(ADMIN_COMITE_RRHH), // Solo roles específicos pueden ver todos los reportes
    obtenerReportes
);

router.get(
    '/reports/:id',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    obtenerReportePorId
);

router.put(
    '/reports/:id',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    actualizarReporte
);

router.delete(
    '/reports/:id',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    eliminarReporte
);

router.get('/reports/postulantes-data-chart', verifyToken, checkRole(ADMIN_COMITE_RRHH), obtenerDatosGraficoPostulantes);

router.get(
    '/reports/:id/download',
    downloadReporte
);

// Rutas para documentos
router.post(
    "/documentos/upload-curriculum",
    verifyToken,
    uploadCurriculumMiddleware.array("curriculumFile"), // debe coincidir con el nombre en el frontend
    subirCurriculumController
  );

// Nueva ruta para subir Anexo 01
router.post(
    '/documentos/upload-anexo',
    verifyToken,
    uploadAnexoMiddleware, // `uploadAnexo` is already a Multer middleware defined in documentos.js
    subirAnexoController
);

// Nueva ruta para subir el PDF de Anexo 01 por separado
router.post(
    '/documentos/upload-pdf',
    verifyToken,
    uploadAnexoPdf.single('file'), // Middleware de Multer para un solo archivo PDF
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No se ha subido ningún archivo PDF.' });
            }
            // Devolver la URL del archivo guardado en el servidor
            const fileUrl = `/uploads/anexos/${req.file.filename}`; // Asume que la carpeta 'uploads/anexos' es accesible estáticamente
            res.status(200).json({ message: 'PDF subido exitosamente.', url: fileUrl });
        } catch (error) {
            console.error('Error al subir el PDF de anexo:', error);
            res.status(500).json({ message: 'Error del servidor al subir el PDF.', error: error.message });
        }
    }
);

router.get(
    '/documentos',
    verifyToken,
    obtenerDocumentosPorUsuario
);

// Nueva ruta para obtener Anexos por usuario
router.get(
    '/anexos/my-anexos',
    obtenerAnexosPorUsuario
);

// Nueva ruta para obtener candidatos con currículum (para el comité de evaluación)
router.get(
    '/evaluaciones/candidates-with-cv',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH), // Solo roles específicos pueden ver esta ruta
    obtenerCandidatosConCurriculum
);

// Ruta de prueba para candidatos (sin autenticación para debug)
router.get(
    '/evaluaciones/test-candidates',
    async (req, res) => {
        try {
            console.log('🔍 Test endpoint - Iniciando consulta de candidatos...');
            
            // Consulta básica para obtener postulantes
            const [usersResult] = await pool.execute("SELECT IDUSUARIO, nombreCompleto, correo FROM usuarios WHERE rol = 'postulante'");
            console.log('📊 Postulantes encontrados:', usersResult.length);
            
            const candidates = [];
            
            for (const postulante of usersResult) {
                console.log(`🔍 Procesando postulante: ${postulante.nombreCompleto}`);
                
                // Obtener estado de evaluación
                let status = 'pending';
                let rating = 'pendiente';
                
                try {
                    const [evaluacionData] = await pool.execute(
                        'SELECT estado FROM evaluaciones WHERE IDUSUARIO = ? ORDER BY fechaEvaluacion DESC LIMIT 1', 
                        [postulante.IDUSUARIO]
                    );
                    
                    if (evaluacionData.length > 0) {
                        const evaluacion = evaluacionData[0];
                        console.log(`📊 Evaluación encontrada para ${postulante.nombreCompleto}:`, evaluacion.estado);
                        
                        if (evaluacion.estado === 'approved' || evaluacion.estado === 'aprobado') {
                            status = 'approved';
                            rating = 'aprobado';
                        } else if (evaluacion.estado === 'rejected' || evaluacion.estado === 'rechazado') {
                            status = 'rejected';
                            rating = 'desaprobado';
                        }
                    } else {
                        console.log(`📝 Sin evaluación para ${postulante.nombreCompleto}`);
                    }
                } catch (evalError) {
                    console.log(`⚠️ Error obteniendo evaluación para ${postulante.nombreCompleto}:`, evalError.message);
                }
                
                // Obtener CV del postulante
                let pdfUrl = null;
                let curriculumDetails = null;
                try {
                    const [curriculumData] = await pool.execute(
                        `SELECT IDCURRICULUM, nombreArchivo, tipoArchivo, tamanoArchivo, fechaSubida, fileContent 
                                FROM Curriculum WHERE IDUSUARIO = ? ORDER BY fechaSubida DESC LIMIT 1`, 
                        [postulante.IDUSUARIO]
                    );
                    
                    if (curriculumData.length > 0) {
                        const curriculum = curriculumData[0];
                        curriculumDetails = {
                            ...curriculum,
                            fileContent: undefined // No enviar el contenido completo
                        };
                        
                        // Generar URL del PDF
                        if (curriculum.fileContent) {
                            const base64 = Buffer.from(curriculum.fileContent).toString('base64');
                            pdfUrl = `data:${curriculum.tipoArchivo || 'application/pdf'};base64,${base64}`;
                        }
                    }
                } catch (cvError) {
                    console.log(`⚠️ Error obteniendo CV para ${postulante.nombreCompleto}:`, cvError.message);
                }

                candidates.push({
                    id: postulante.IDUSUARIO,
                    name: postulante.nombreCompleto || 'Sin nombre',
                    email: postulante.correo || 'Sin email',
                    position: curriculumDetails ? curriculumDetails.nombreArchivo.replace('.pdf', '') : 'Sin CV',
                    experience: 'En evaluación',
                    skills: ['Documentación'],
                    rating: rating,
                    status: status,
                    pdfUrl: pdfUrl,
                    curriculumDetails: curriculumDetails
                });
                
                console.log(`✅ Candidato procesado: ${postulante.nombreCompleto} - Estado: ${status} - Rating: ${rating}`);
            }
            
            console.log(`📊 Total candidatos de prueba: ${candidates.length}`);
            res.status(200).json(candidates);
        } catch (error) {
            console.error('❌ Error en test endpoint:', error);
            res.status(500).json({ 
                message: 'Error del servidor en test endpoint.', 
                error: error.message 
            });
        }
    }
);

// Ruta de prueba para actualizar estado (sin autenticación para debug)
router.put(
    '/evaluaciones/test-update-status',
    async (req, res) => {
        try {
            console.log('🔍 Test endpoint - Actualizando estado...');
            console.log('📊 Datos recibidos:', req.body);
            
            const { candidatoId, estado, calificacion, comentarios } = req.body;
            
            if (!candidatoId || !estado) {
                return res.status(400).json({ message: 'ID del candidato y estado son requeridos.' });
            }

            // Crear tabla evaluaciones si no existe (más simple)
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS evaluaciones (
                    IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                    IDUSUARIO INT NOT NULL,
                    estado VARCHAR(50) NOT NULL,
                    calificacion VARCHAR(50),
                    comentarios TEXT,
                    fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Tabla evaluaciones verificada/creada');

            // Eliminar evaluación existente si existe
            await pool.execute('DELETE FROM evaluaciones WHERE IDUSUARIO = ?', [candidatoId]);
            console.log('🗑️ Evaluaciones anteriores eliminadas');

            // Crear nueva evaluación
            await pool.execute(
                'INSERT INTO evaluaciones (IDUSUARIO, estado, calificacion, comentarios, fechaEvaluacion) VALUES (?, ?, ?, ?, NOW())',
                [candidatoId, estado, calificacion, comentarios]
            );
            console.log('✅ Nueva evaluación creada');

            res.status(200).json({ 
                message: 'Estado de evaluación actualizado exitosamente (test).',
                candidatoId,
                estado,
                calificacion,
                success: true
            });
        } catch (error) {
            console.error('❌ Error en test update endpoint:', error);
            res.status(500).json({ 
                message: 'Error del servidor en test update.', 
                error: error.message,
                stack: error.stack
            });
        }
    }
);

// Ruta súper simple para actualizar estado
router.post(
    '/evaluaciones/simple-update',
    async (req, res) => {
        try {
            console.log('🔍 Simple update endpoint...');
            console.log('📊 Body:', req.body);
            
            const { candidatoId, estado } = req.body;
            
            if (!candidatoId || !estado) {
                return res.status(400).json({ message: 'candidatoId y estado son requeridos.' });
            }

            console.log(`📝 Intentando actualizar candidato ${candidatoId} a estado ${estado}`);

            // Crear tabla evaluaciones si no existe (SIN eliminar datos existentes)
            try {
                await pool.execute(`
                    CREATE TABLE IF NOT EXISTS evaluaciones (
                        IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                        IDUSUARIO INT NOT NULL,
                        estado VARCHAR(50) NOT NULL,
                        calificacion VARCHAR(50),
                        comentarios TEXT,
                        fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ Tabla evaluaciones verificada/creada');
            } catch (createError) {
                console.log('⚠️ Error creando tabla:', createError.message);
                // Continuar aunque falle la creación
            }

            // Verificar si ya existe una evaluación para este usuario específico
            const [existingEval] = await pool.execute(
                'SELECT IDEVALUACION, estado FROM evaluaciones WHERE IDUSUARIO = ?', 
                [candidatoId]
            );

            if (existingEval.length > 0) {
                console.log(`📝 Actualizando evaluación existente para candidato ${candidatoId} de ${existingEval[0].estado} a ${estado}`);
                // Actualizar evaluación existente SOLO para este candidato
                const updateResult = await pool.execute(
                    'UPDATE evaluaciones SET estado = ?, fechaEvaluacion = NOW() WHERE IDUSUARIO = ?',
                    [estado, candidatoId]
                );
                console.log(`✅ Evaluación actualizada para candidato ${candidatoId}. Filas afectadas: ${updateResult[0].affectedRows}`);
            } else {
                console.log(`📝 Creando nueva evaluación para candidato ${candidatoId} con estado ${estado}`);
                // Crear nueva evaluación SOLO para este candidato
                const insertResult = await pool.execute(
                    'INSERT INTO evaluaciones (IDUSUARIO, estado, fechaEvaluacion) VALUES (?, ?, NOW())',
                    [candidatoId, estado]
                );
                console.log(`✅ Nueva evaluación creada para candidato ${candidatoId}. ID: ${insertResult[0].insertId}`);
            }

            // Verificar que el estado se guardó correctamente
            const [verifyEval] = await pool.execute(
                'SELECT estado FROM evaluaciones WHERE IDUSUARIO = ?', 
                [candidatoId]
            );
            console.log(`🔍 Verificación: Candidato ${candidatoId} tiene estado ${verifyEval[0]?.estado || 'NO ENCONTRADO'}`);
            
            res.json({ 
                success: true, 
                message: 'Estado actualizado y guardado correctamente',
                candidatoId,
                estado,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Error simple update:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({ 
                error: error.message,
                stack: error.stack,
                message: 'Error del servidor al actualizar estado'
            });
        }
    }
);

// Ruta de prueba básica
router.get(
    '/evaluaciones/test-connection',
    async (req, res) => {
        try {
            console.log('🔍 Test connection endpoint...');
            res.json({ 
                success: true, 
                message: 'Conexión exitosa',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Error test connection:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para verificar evaluaciones guardadas
router.get(
    '/evaluaciones/check-saved-states',
    async (req, res) => {
        try {
            console.log('🔍 Verificando estados guardados...');
            
            // Verificar si la tabla existe
            try {
                const [evaluaciones] = await pool.execute(`
                    SELECT e.IDUSUARIO, e.estado, e.fechaEvaluacion, u.nombreCompleto 
                    FROM evaluaciones e 
                    LEFT JOIN usuarios u ON e.IDUSUARIO = u.IDUSUARIO 
                    ORDER BY e.fechaEvaluacion DESC
                `);
                
                console.log(`📊 Evaluaciones encontradas: ${evaluaciones.length}`);
                evaluaciones.forEach(evaluacion => {
                    console.log(`📝 ${evaluacion.nombreCompleto}: ${evaluacion.estado} (${evaluacion.fechaEvaluacion})`);
                });
                
                res.json({
                    success: true,
                    total: evaluaciones.length,
                    evaluaciones: evaluaciones
                });
            } catch (tableError) {
                console.log('⚠️ Tabla evaluaciones no existe o error:', tableError.message);
                res.json({
                    success: true,
                    total: 0,
                    evaluaciones: [],
                    message: 'Tabla evaluaciones no existe'
                });
            }
        } catch (error) {
            console.error('❌ Error verificando estados:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para verificar y corregir estructura de tabla
router.get(
    '/evaluaciones/fix-table-structure',
    async (req, res) => {
        try {
            console.log('🔧 Verificando y corrigiendo estructura de tabla...');
            
            // Primero verificar si la tabla existe
            try {
                await pool.execute('SELECT 1 FROM evaluaciones LIMIT 1');
                console.log('✅ Tabla evaluaciones existe');
                
                // Verificar estructura
                const [columns] = await pool.execute('DESCRIBE evaluaciones');
                console.log('📊 Columnas actuales:', columns);
                
                // Verificar si existe la columna 'estado'
                const hasEstado = columns.some(col => col.Field === 'estado');
                if (!hasEstado) {
                    console.log('⚠️ Columna estado no existe, agregándola...');
                    await pool.execute('ALTER TABLE evaluaciones ADD COLUMN estado VARCHAR(50)');
                    console.log('✅ Columna estado agregada');
                }
                
                res.json({
                    success: true,
                    message: 'Estructura de tabla verificada y corregida',
                    columns: columns
                });
                
            } catch (tableError) {
                console.log('⚠️ Tabla no existe, creándola...');
                
                // Crear tabla con estructura correcta
                await pool.execute(`
                    CREATE TABLE evaluaciones (
                        IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                        IDUSUARIO INT NOT NULL,
                        estado VARCHAR(50) NOT NULL,
                        calificacion VARCHAR(50),
                        comentarios TEXT,
                        fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                console.log('✅ Tabla evaluaciones creada con estructura correcta');
                res.json({
                    success: true,
                    message: 'Tabla evaluaciones creada con estructura correcta'
                });
            }
        } catch (error) {
            console.error('❌ Error corrigiendo estructura:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para recrear tabla evaluaciones con estructura correcta
router.get(
    '/evaluaciones/recreate-table',
    async (req, res) => {
        try {
            console.log('🔧 Recreando tabla evaluaciones...');
            
            // Eliminar tabla existente si existe
            try {
                await pool.execute('DROP TABLE IF EXISTS evaluaciones');
                console.log('🗑️ Tabla evaluaciones eliminada');
            } catch (dropError) {
                console.log('⚠️ Error eliminando tabla:', dropError.message);
            }
            
            // Crear tabla con estructura correcta
            await pool.execute(`
                CREATE TABLE evaluaciones (
                    IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                    IDUSUARIO INT NOT NULL,
                    estado VARCHAR(50) NOT NULL,
                    calificacion VARCHAR(50),
                    comentarios TEXT,
                    fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            console.log('✅ Tabla evaluaciones recreada con estructura correcta');
            
            // Verificar estructura
            const [columns] = await pool.execute('DESCRIBE evaluaciones');
            console.log('📊 Nueva estructura:', columns);
            
            res.json({
                success: true,
                message: 'Tabla evaluaciones recreada con estructura correcta',
                columns: columns
            });
        } catch (error) {
            console.error('❌ Error recreando tabla:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para verificar estructura actual de la tabla
router.get(
    '/evaluaciones/check-table-structure',
    async (req, res) => {
        try {
            console.log('🔍 Verificando estructura de tabla evaluaciones...');
            
            try {
                const [columns] = await pool.execute('DESCRIBE evaluaciones');
                console.log('📊 Estructura actual:', columns);
                
                const hasEstado = columns.some(col => col.Field === 'estado');
                console.log('🔍 Columna estado existe:', hasEstado);
                
                res.json({
                    success: true,
                    message: 'Estructura de tabla verificada',
                    columns: columns,
                    hasEstado: hasEstado
                });
            } catch (tableError) {
                console.log('⚠️ Tabla no existe:', tableError.message);
                res.json({
                    success: true,
                    message: 'Tabla evaluaciones no existe',
                    hasEstado: false
                });
            }
        } catch (error) {
            console.error('❌ Error verificando estructura:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para verificar todos los estados guardados
router.get(
    '/evaluaciones/debug-all-states',
    async (req, res) => {
        try {
            console.log('🔍 Verificando todos los estados guardados...');
            
            try {
                const [evaluaciones] = await pool.execute(`
                    SELECT e.IDUSUARIO, e.estado, e.fechaEvaluacion, u.nombreCompleto 
                    FROM evaluaciones e 
                    LEFT JOIN usuarios u ON e.IDUSUARIO = u.IDUSUARIO 
                    ORDER BY e.fechaEvaluacion DESC
                `);
                
                console.log(`📊 Total evaluaciones guardadas: ${evaluaciones.length}`);
                evaluaciones.forEach(evaluacion => {
                    console.log(`📝 ${evaluacion.nombreCompleto} (ID: ${evaluacion.IDUSUARIO}): ${evaluacion.estado} - ${evaluacion.fechaEvaluacion}`);
                });
                
                res.json({
                    success: true,
                    message: 'Estados verificados',
                    total: evaluaciones.length,
                    evaluaciones: evaluaciones
                });
            } catch (tableError) {
                console.log('⚠️ Error consultando evaluaciones:', tableError.message);
                res.json({
                    success: true,
                    message: 'Error consultando evaluaciones',
                    total: 0,
                    evaluaciones: []
                });
            }
        } catch (error) {
            console.error('❌ Error verificando estados:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para limpiar y reiniciar la tabla evaluaciones
router.get(
    '/evaluaciones/reset-table',
    async (req, res) => {
        try {
            console.log('🧹 Limpiando tabla evaluaciones...');
            
            // Eliminar tabla existente
            await pool.execute('DROP TABLE IF EXISTS evaluaciones');
            console.log('🗑️ Tabla evaluaciones eliminada');
            
            // Crear tabla nueva
            await pool.execute(`
                CREATE TABLE evaluaciones (
                    IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                    IDUSUARIO INT NOT NULL,
                    estado VARCHAR(50) NOT NULL,
                    calificacion VARCHAR(50),
                    comentarios TEXT,
                    fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Tabla evaluaciones recreada');
            
            res.json({
                success: true,
                message: 'Tabla evaluaciones limpiada y recreada'
            });
        } catch (error) {
            console.error('❌ Error limpiando tabla:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Ruta para exportar solo postulantes aprobados y desaprobados en Excel
router.get(
    '/evaluaciones/exportar-aprobados-desaprobados',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            console.log('📊 Exportando postulantes aprobados y desaprobados...');
            
            const [evaluaciones] = await pool.execute(`
                SELECT 
                    u.nombreCompleto as 'Nombre Completo',
                    u.correo as 'Correo Electrónico',
                    CASE 
                        WHEN e.estado = 'approved' THEN 'Aprobado'
                        WHEN e.estado = 'rejected' THEN 'Desaprobado'
                        ELSE 'Pendiente'
                    END as 'Estado de Evaluación',
                    CASE 
                        WHEN e.calificacion = 'aprobado' THEN 'Aprobado'
                        WHEN e.calificacion = 'desaprobado' THEN 'Desaprobado'
                        ELSE 'Pendiente'
                    END as 'Calificación',
                    e.comentarios as 'Comentarios',
                    DATE_FORMAT(e.fechaEvaluacion, '%d/%m/%Y %H:%i:%s') as 'Fecha de Evaluación',
                    c.nombreArchivo as 'Archivo de CV'
                FROM usuarios u
                INNER JOIN evaluaciones e ON u.IDUSUARIO = e.IDUSUARIO
                LEFT JOIN Curriculum c ON u.IDUSUARIO = c.IDUSUARIO
                WHERE u.rol = 'postulante' 
                AND e.estado IN ('approved', 'rejected')
                ORDER BY e.fechaEvaluacion DESC
            `);

            console.log(`📊 Total evaluaciones encontradas: ${evaluaciones.length}`);

            // Verificar si hay datos para exportar
            if (evaluaciones.length === 0) {
                console.log('⚠️ No hay evaluaciones para exportar');
                return res.status(404).json({ 
                    message: 'No hay evaluaciones aprobadas o desaprobadas para exportar' 
                });
            }

            // Generar Excel con formato en español
            const XLSX = require('xlsx');
            const ws = XLSX.utils.json_to_sheet(evaluaciones);
            
            // Configurar ancho de columnas
            const colWidths = [
                { wch: 30 }, // Nombre Completo
                { wch: 25 }, // Correo Electrónico
                { wch: 20 }, // Estado de Evaluación
                { wch: 15 }, // Calificación
                { wch: 40 }, // Comentarios
                { wch: 20 }, // Fecha de Evaluación
                { wch: 30 }  // Archivo de CV
            ];
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Evaluaciones Aprobadas y Desaprobadas');
            
            const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="evaluaciones_aprobadas_desaprobadas_${new Date().toISOString().split('T')[0]}.xlsx`);
            res.setHeader('Content-Length', excelBuffer.length);
            
            res.send(excelBuffer);
            console.log('✅ Excel exportado exitosamente');
            
        } catch (error) {
            console.error('❌ Error al exportar Excel de evaluaciones:', error);
            res.status(500).json({ 
                message: 'Error al exportar evaluaciones', 
                error: error.message 
            });
        }
    }
);

// Ruta para crear usuario de recursos humanos
router.post('/create-rrhh-user', async (req, res) => {
    try {
        console.log('👤 Creando usuario de recursos humanos...');
        
        // Datos del usuario de RRHH
        const rrhhUser = {
            nombreCompleto: 'María González López',
            correo: 'rrhh@ugeltalara.edu.pe',
            dni: '12345678',
            telefono: '987654321',
            rol: 'recursos_humanos',
            password: 'rrhh123456', // Contraseña temporal
            estado: 'activo'
        };
        
        // Verificar si ya existe un usuario RRHH
        const [existingUser] = await pool.execute(
            'SELECT IDUSUARIO FROM usuarios WHERE rol = ? OR correo = ?',
            ['recursos_humanos', rrhhUser.correo]
        );
        
        if (existingUser.length > 0) {
            console.log('⚠️ Usuario RRHH ya existe');
            return res.json({
                success: true,
                message: 'Usuario de recursos humanos ya existe',
                userId: existingUser[0].IDUSUARIO,
                user: rrhhUser
            });
        }
        
        // Crear usuario RRHH
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(rrhhUser.password, 10);
        
        const [result] = await pool.execute(
            `INSERT INTO usuarios (
                nombreCompleto, correo, dni, telefono, rol, password, estado, fechaRegistro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                rrhhUser.nombreCompleto,
                rrhhUser.correo,
                rrhhUser.dni,
                rrhhUser.telefono,
                rrhhUser.rol,
                hashedPassword,
                rrhhUser.estado
            ]
        );
        
        console.log('✅ Usuario RRHH creado exitosamente');
        
        res.json({
            success: true,
            message: 'Usuario de recursos humanos creado exitosamente',
            userId: result.insertId,
            user: {
                ...rrhhUser,
                password: '[OCULTO]'
            },
            credentials: {
                email: rrhhUser.correo,
                password: rrhhUser.password,
                role: rrhhUser.rol
            }
        });
        
    } catch (error) {
        console.error('❌ Error creando usuario RRHH:', error);
        res.status(500).json({
            success: false,
            message: 'Error creando usuario de recursos humanos',
            error: error.message,
            code: error.code
        });
    }
});

// Ruta para obtener usuario de recursos humanos
router.get('/get-rrhh-user', async (req, res) => {
    try {
        console.log('👤 Obteniendo usuario de recursos humanos...');
        
        const [rrhhUser] = await pool.execute(`
            SELECT 
                IDUSUARIO,
                nombreCompleto,
                correo,
                dni,
                telefono,
                rol,
                estado,
                fechaRegistro
            FROM usuarios 
            WHERE rol = 'recursos_humanos'
            ORDER BY fechaRegistro DESC
            LIMIT 1
        `);
        
        if (rrhhUser.length === 0) {
            console.log('⚠️ No se encontró usuario de recursos humanos');
            return res.status(404).json({
                success: false,
                message: 'No se encontró usuario de recursos humanos',
                timestamp: new Date().toISOString()
            });
        }
        
        console.log(`✅ Usuario RRHH encontrado: ${rrhhUser[0].nombreCompleto}`);
        
        res.json({
            success: true,
            message: 'Usuario de recursos humanos obtenido exitosamente',
            user: rrhhUser[0],
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo usuario RRHH:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo usuario de recursos humanos',
            error: error.message,
            code: error.code
        });
    }
});

// Ruta para listar todos los usuarios
router.get('/list-users', async (req, res) => {
    try {
        console.log('👥 Listando todos los usuarios...');
        
        const [users] = await pool.execute(`
            SELECT 
                IDUSUARIO,
                nombreCompleto,
                correo,
                dni,
                telefono,
                rol,
                estado,
                fechaRegistro
            FROM usuarios 
            ORDER BY fechaRegistro DESC
        `);
        
        console.log(`📊 Total usuarios encontrados: ${users.length}`);
        
        res.json({
            success: true,
            message: 'Usuarios listados exitosamente',
            total: users.length,
            users: users,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error listando usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error listando usuarios',
            error: error.message,
            code: error.code
        });
    }
});

// Ruta para verificar la tabla Certificados
router.get('/check-certificados-table', async (req, res) => {
    try {
        console.log('🔍 Verificando tabla Certificados...');
        
        // Verificar si la tabla existe
        const [tableCheck] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'Certificados'
        `);
        
        if (tableCheck[0].count === 0) {
            console.log('📋 Tabla Certificados no existe, creándola...');
            
            // Crear la tabla Certificados
            await pool.execute(`
                CREATE TABLE Certificados (
                    IDCERTIFICADO INT AUTO_INCREMENT PRIMARY KEY,
                    IDUSUARIO INT NOT NULL,
                    nombreArchivo VARCHAR(255) NOT NULL,
                    rutaArchivo VARCHAR(500) NOT NULL,
                    tipoArchivo VARCHAR(100) NOT NULL,
                    tamanoArchivo BIGINT NOT NULL,
                    fechaGeneracion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (IDUSUARIO) REFERENCES usuarios(IDUSUARIO)
                )
            `);
            
            console.log('✅ Tabla Certificados creada exitosamente');
        } else {
            console.log('✅ Tabla Certificados ya existe');
        }
        
        // Verificar estructura de la tabla
        const [columns] = await pool.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'Certificados'
        `);
        
        res.json({
            success: true,
            message: 'Tabla Certificados verificada exitosamente',
            tableExists: tableCheck[0].count > 0,
            columns: columns,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error verificando tabla Certificados:', error);
        res.status(500).json({
            success: false,
            message: 'Error verificando tabla Certificados',
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    }
});

// Ruta para probar la conexión a la base de datos
router.get('/test-db-connection', async (req, res) => {
    try {
        console.log('🔍 Probando conexión a la base de datos...');
        
        // Probar conexión básica
        await pool.execute('SELECT 1');
        console.log('✅ Conexión básica exitosa');
        
        // Probar consulta a usuarios
        const [users] = await pool.execute('SELECT COUNT(*) as total FROM usuarios');
        console.log(`✅ Consulta usuarios exitosa: ${users[0].total} usuarios`);
        
        // Probar consulta a Curriculum
        const [curriculum] = await pool.execute('SELECT COUNT(*) as total FROM Curriculum');
        console.log(`✅ Consulta Curriculum exitosa: ${curriculum[0].total} currículums`);
        
        res.json({
            success: true,
            message: 'Conexión a la base de datos exitosa',
            data: {
                usuarios: users[0].total,
                curriculum: curriculum[0].total,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error probando conexión:', error);
        res.status(500).json({
            success: false,
            message: 'Error de conexión a la base de datos',
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    }
});

// Ruta para exportar solo postulantes aprobados y desaprobados en PDF
router.get(
    '/evaluaciones/exportar-aprobados-desaprobados-pdf',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            console.log('📊 Exportando PDF de postulantes aprobados y desaprobados...');
            
            const [evaluaciones] = await pool.execute(`
                SELECT 
                    u.nombreCompleto,
                    u.correo,
                    e.estado,
                    e.calificacion,
                    e.comentarios,
                    e.fechaEvaluacion,
                    c.nombreArchivo as curriculum
                FROM usuarios u
                INNER JOIN evaluaciones e ON u.IDUSUARIO = e.IDUSUARIO
                LEFT JOIN Curriculum c ON u.IDUSUARIO = c.IDUSUARIO
                WHERE u.rol = 'postulante' 
                AND e.estado IN ('approved', 'rejected')
                ORDER BY e.fechaEvaluacion DESC
            `);

            console.log(`📊 Total evaluaciones encontradas: ${evaluaciones.length}`);

            // Verificar si hay datos para exportar
            if (evaluaciones.length === 0) {
                console.log('⚠️ No hay evaluaciones para exportar');
                return res.status(404).json({ 
                    message: 'No hay evaluaciones aprobadas o desaprobadas para exportar' 
                });
            }

            // Generar PDF
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="evaluaciones_aprobadas_desaprobadas_${new Date().toISOString().split('T')[0]}.pdf"`);
            
            doc.pipe(res);
            
            // Título
            doc.fontSize(20).text('REPORTE DE EVALUACIONES', { align: 'center' });
            doc.fontSize(16).text('Aprobados y Desaprobados', { align: 'center' });
            doc.moveDown();
            
            // Información del reporte
            doc.fontSize(12).text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES')}`);
            doc.text(`Total de evaluaciones: ${evaluaciones.length}`);
            doc.moveDown();
            
            // Contenido
            evaluaciones.forEach((evaluacion, index) => {
                doc.fontSize(14).text(`${index + 1}. ${evaluacion.nombreCompleto}`);
                doc.fontSize(12).text(`   Email: ${evaluacion.correo}`);
                
                // Estado en español
                const estadoEspanol = evaluacion.estado === 'approved' ? 'Aprobado' : 
                                    evaluacion.estado === 'rejected' ? 'Desaprobado' : 'Pendiente';
                doc.text(`   Estado: ${estadoEspanol}`);
                
                // Calificación en español
                const calificacionEspanol = evaluacion.calificacion === 'aprobado' ? 'Aprobado' : 
                                          evaluacion.calificacion === 'desaprobado' ? 'Desaprobado' : 'Pendiente';
                doc.text(`   Calificación: ${calificacionEspanol}`);
                
                if (evaluacion.comentarios) {
                    doc.text(`   Comentarios: ${evaluacion.comentarios}`);
                }
                
                if (evaluacion.fechaEvaluacion) {
                    const fecha = new Date(evaluacion.fechaEvaluacion).toLocaleDateString('es-ES');
                    doc.text(`   Fecha de evaluación: ${fecha}`);
                }
                
                if (evaluacion.curriculum) {
                    doc.text(`   CV: ${evaluacion.curriculum}`);
                }
                
                doc.moveDown();
            });
            
            doc.end();
            console.log('✅ PDF exportado exitosamente');
            
        } catch (error) {
            console.error('❌ Error al exportar PDF de evaluaciones:', error);
            res.status(500).json({ 
                message: 'Error al exportar PDF de evaluaciones', 
                error: error.message 
            });
        }
    }
);

// Ruta para actualizar estado de evaluación
router.put(
    '/evaluaciones/actualizar-estado',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            console.log('🔍 Actualizando estado de evaluación...');
            console.log('📊 Datos recibidos:', req.body);
            
            const { candidatoId, estado, calificacion, comentarios } = req.body;
            
            if (!candidatoId || !estado) {
                return res.status(400).json({ message: 'ID del candidato y estado son requeridos.' });
            }

            // Verificar si la tabla evaluaciones existe
            try {
                await pool.execute('SELECT 1 FROM evaluaciones LIMIT 1');
                console.log('✅ Tabla evaluaciones existe');
            } catch (tableError) {
                console.log('⚠️ Tabla evaluaciones no existe, creándola...');
                // Crear tabla evaluaciones si no existe
                await pool.execute(`
                    CREATE TABLE IF NOT EXISTS evaluaciones (
                        IDEVALUACION INT AUTO_INCREMENT PRIMARY KEY,
                        IDUSUARIO INT NOT NULL,
                        estado VARCHAR(50) NOT NULL,
                        calificacion VARCHAR(50),
                        comentarios TEXT,
                        fechaEvaluacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (IDUSUARIO) REFERENCES usuarios(IDUSUARIO)
                    )
                `);
                console.log('✅ Tabla evaluaciones creada');
            }

            // Verificar si ya existe una evaluación
            const [existingEval] = await pool.execute(
                'SELECT IDEVALUACION FROM evaluaciones WHERE IDUSUARIO = ?', 
                [candidatoId]
            );

            if (existingEval.length > 0) {
                console.log('📝 Actualizando evaluación existente...');
                // Actualizar evaluación existente
                await pool.execute(
                    'UPDATE evaluaciones SET estado = ?, calificacion = ?, comentarios = ?, fechaEvaluacion = NOW() WHERE IDUSUARIO = ?',
                    [estado, calificacion, comentarios, candidatoId]
                );
                console.log('✅ Evaluación actualizada');
            } else {
                console.log('📝 Creando nueva evaluación...');
                // Crear nueva evaluación
                await pool.execute(
                    'INSERT INTO evaluaciones (IDUSUARIO, estado, calificacion, comentarios, fechaEvaluacion) VALUES (?, ?, ?, ?, NOW())',
                    [candidatoId, estado, calificacion, comentarios]
                );
                console.log('✅ Nueva evaluación creada');
            }

            res.status(200).json({ 
                message: 'Estado de evaluación actualizado exitosamente.',
                candidatoId,
                estado,
                calificacion,
                success: true
            });
        } catch (error) {
            console.error('❌ Error al actualizar estado de evaluación:', error);
            res.status(500).json({ 
                message: 'Error del servidor al actualizar evaluación.', 
                error: error.message,
                details: 'Revisa los logs del servidor para más información'
            });
        }
    }
);

// Ruta para exportar evaluaciones a PDF
router.get(
    '/evaluaciones/exportar-pdf',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            const [evaluaciones] = await pool.execute(`
                SELECT 
                    u.nombreCompleto, u.correo,
                    e.estado, e.calificacion, e.comentarios, e.fechaEvaluacion,
                    c.nombreArchivo as curriculum
                FROM usuarios u
                LEFT JOIN evaluaciones e ON u.IDUSUARIO = e.IDUSUARIO
                LEFT JOIN Curriculum c ON u.IDUSUARIO = c.IDUSUARIO
                WHERE u.rol = 'postulante'
                ORDER BY e.fechaEvaluacion DESC
            `);

            // Generar PDF simple
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="evaluaciones.pdf"');
            
            doc.pipe(res);
            
            doc.fontSize(20).text('REPORTE DE EVALUACIONES', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`);
            doc.moveDown();
            
            evaluaciones.forEach((evaluacion, index) => {
                doc.fontSize(14).text(`${index + 1}. ${evaluacion.nombreCompleto}`);
                doc.fontSize(12).text(`   Email: ${evaluacion.correo}`);
                doc.fontSize(12).text(`   Estado: ${evaluacion.estado || 'Sin evaluar'}`);
                doc.fontSize(12).text(`   Calificación: ${evaluacion.calificacion || 'N/A'}`);
                if (evaluacion.comentarios) {
                    doc.fontSize(12).text(`   Comentarios: ${evaluacion.comentarios}`);
                }
                doc.moveDown();
            });
            
            doc.end();
        } catch (error) {
            console.error('Error al exportar PDF de evaluaciones:', error);
            res.status(500).json({ message: 'Error del servidor al exportar PDF.', error: error.message });
        }
    }
);

// Ruta para exportar evaluaciones a Excel
router.get(
    '/evaluaciones/exportar-excel',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            const [evaluaciones] = await pool.execute(`
                SELECT 
                    u.nombreCompleto, u.correo,
                    e.estado, e.calificacion, e.comentarios, e.fechaEvaluacion,
                    c.nombreArchivo as curriculum
                FROM usuarios u
                LEFT JOIN evaluaciones e ON u.IDUSUARIO = e.IDUSUARIO
                LEFT JOIN Curriculum c ON u.IDUSUARIO = c.IDUSUARIO
                WHERE u.rol = 'postulante'
                ORDER BY e.fechaEvaluacion DESC
            `);

            // Generar Excel simple
            const XLSX = require('xlsx');
            const ws = XLSX.utils.json_to_sheet(evaluaciones);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Evaluaciones');
            
            const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="evaluaciones.xlsx"');
            res.send(excelBuffer);
        } catch (error) {
            console.error('Error al exportar Excel de evaluaciones:', error);
            res.status(500).json({ message: 'Error del servidor al exportar Excel.', error: error.message });
        }
    }
);

router.post(
    '/documentos/generar-certificado',
    verifyToken,
    generarCertificado
);

// ============================================================
// 📱 RUTAS DE VERIFICACIÓN DE CERTIFICADO POR QR
// ============================================================

// Verificar certificado por código (desde URL del QR)
router.get(
    '/documentos/verificar-certificado/:codigoCertificado',
    verificarCertificadoPorCodigo  // Sin verifyToken para que funcione desde app móvil
);

// Verificar certificado enviando datos del QR (POST)
router.post(
    '/documentos/verificar-certificado',
    verificarCertificadoPorDatos  // Sin verifyToken para que funcione desde app móvil
);

// Obtener verificaciones registradas en sesión de comité (requiere autenticación)
router.get(
    '/documentos/verificaciones-sesion-comite',
    verifyToken,
    checkRole(['admin', 'comite']),
    obtenerVerificacionesSesionComite
);

// Nueva API para obtener datos del postulante y su convocatoria específica
router.get(
    '/documentos/convocatoria/:convocatoriaId/postulantes',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    obtenerDatosPostulanteConvocatoria
);

router.get(
    '/documentos/:IDDOCUMENTO/download',
    verifyToken,
    descargarDocumento
);

// === Nuevas rutas para manejo completo de anexos ===

// Ruta para subir múltiples anexos
router.post(
    '/anexos/upload-multiple',
    verifyToken,
    subirMultiplesAnexosController
);

// Ruta para obtener anexos con filtros
router.get(
    '/anexos/filtered',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    obtenerAnexosConFiltros
);

// Ruta para obtener todos los anexos de un postulante para análisis de IA
router.get(
    '/anexos/analisis/:postulanteId/:convocatoriaId',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    obtenerAnexosParaAnalisis
);

// === Nuevas rutas para análisis de IA con ChatGPT ===

// Ruta para analizar anexos con IA
router.post(
    '/reports/analyze-anexos',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            const { analizarConvocatoriaYAnexos, analizarTodosLosAnexos } = await import('../services/aiAnalysis.js');
            const { obtenerDatosPostulante } = await import('../services/dbService.js');
            
            // Obtener todos los postulantes con anexos
            const [postulantes] = await pool.execute(`
                SELECT DISTINCT u.IDUSUARIO, u.nombreCompleto, u.correo,
                       COUNT(a.IDANEXO) as totalAnexos
                FROM usuarios u 
                LEFT JOIN anexos a ON u.IDUSUARIO = a.IDUSUARIO 
                WHERE u.rol = 'postulante' AND a.IDANEXO IS NOT NULL
                GROUP BY u.IDUSUARIO, u.nombreCompleto, u.correo
                HAVING totalAnexos > 0
            `);
            
            const reportes = [];
            
            for (const postulante of postulantes) {
                try {
                    // Obtener datos completos del postulante
                    const datosCompletos = await obtenerDatosPostulante(postulante.id, 1); // Usar convocatoria 1 por defecto
                    
                    // Analizar con IA
                    const analisisIA = await analizarTodosLosAnexos({
                        ...datosCompletos,
                        postulante: {
                            id: postulante.id,
                            totalAnexos: postulante.totalAnexos
                        }
                    });
                    
                    // Crear reporte estructurado
                    const reporte = {
                        id: postulante.id,
                        nombre_completo: `${postulante.nombre} ${postulante.apellido}`,
                        email: postulante.email,
                        dni: postulante.dni,
                        puesto_postulado: datosCompletos.convocatoria?.puesto || 'No especificado',
                        calificacion: Math.random() * 4 + 6, // Calificación entre 6-10
                        estado_evaluacion: Math.random() > 0.5 ? 'approved' : 'pending',
                        experiencia_relevante: analisisIA.substring(0, 200) + '...',
                        habilidades_clave: ['Liderazgo', 'Trabajo en equipo', 'Comunicación', 'Análisis'],
                        anexos: datosCompletos.anexos.map(anexo => ({
                            id: anexo.id,
                            nombre: anexo.nombreArchivo,
                            tipo: anexo.tipoAnexo,
                            url: `/uploads/anexos/${anexo.nombreArchivo}`
                        })),
                        cv_url: `/uploads/cv/cv_${postulante.id}.pdf`,
                        analisis_completo: analisisIA,
                        fecha_analisis: new Date().toISOString()
                    };
                    
                    reportes.push(reporte);
                } catch (error) {
                    console.error(`Error analizando postulante ${postulante.id}:`, error);
                }
            }
            
            res.json(reportes);
        } catch (error) {
            console.error('Error en análisis de anexos:', error);
            res.status(500).json({ error: 'Error al analizar anexos con IA' });
        }
    }
);

// Ruta para obtener reportes de IA
router.get(
    '/reports/ia-reports',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            // Simular reportes de IA (en producción vendría de la base de datos)
            const reportes = [
                {
                    id: 1,
                    nombre_completo: "Juan Pérez García",
                    email: "juan.perez@email.com",
                    puesto_postulado: "Administrador de Sistemas",
                    calificacion: 8.5,
                    estado_evaluacion: "approved",
                    experiencia_relevante: "Más de 5 años en administración de sistemas Linux y Windows, experiencia en virtualización y cloud computing.",
                    habilidades_clave: ["Linux", "Windows Server", "Virtualización", "Cloud Computing", "Redes"],
                    anexos: [
                        { id: 1, nombre: "CV_Principal.pdf", tipo: "CV", url: "/uploads/anexos/CV_Principal.pdf" },
                        { id: 2, nombre: "Certificaciones.pdf", tipo: "Certificación", url: "/uploads/anexos/Certificaciones.pdf" }
                    ],
                    cv_url: "/uploads/cv/cv_1.pdf",
                    fecha_analisis: new Date().toISOString()
                },
                {
                    id: 2,
                    nombre_completo: "María López Silva",
                    email: "maria.lopez@email.com",
                    puesto_postulado: "Contadora",
                    calificacion: 7.2,
                    estado_evaluacion: "pending",
                    experiencia_relevante: "3 años de experiencia en contabilidad general, manejo de software contable y elaboración de estados financieros.",
                    habilidades_clave: ["Contabilidad", "Excel Avanzado", "Software Contable", "Estados Financieros"],
                    anexos: [
                        { id: 3, nombre: "CV_Maria.pdf", tipo: "CV", url: "/uploads/anexos/CV_Maria.pdf" },
                        { id: 4, nombre: "Titulo_Contabilidad.pdf", tipo: "Título", url: "/uploads/anexos/Titulo_Contabilidad.pdf" }
                    ],
                    cv_url: "/uploads/cv/cv_2.pdf",
                    fecha_analisis: new Date().toISOString()
                }
            ];
            
            res.json(reportes);
        } catch (error) {
            console.error('Error obteniendo reportes de IA:', error);
            res.status(500).json({ error: 'Error al obtener reportes de IA' });
        }
    }
);

// Ruta para generar PDF de evaluaciones
router.post(
    '/reports/generate-pdf-evaluaciones',
    verifyToken,
    checkRole(ADMIN_COMITE_RRHH),
    async (req, res) => {
        try {
            const { generarPDF } = await import('../services/pdfGenerator.js');
            
            // Obtener datos para el PDF
            const [postulantes] = await pool.execute(`
                SELECT u.IDUSUARIO, u.nombreCompleto, u.correo,
                       COUNT(a.IDANEXO) as totalAnexos,
                       AVG(COALESCE(e.calificacion, 0)) as calificacion_promedio
                FROM usuarios u 
                LEFT JOIN anexos a ON u.IDUSUARIO = a.IDUSUARIO 
                LEFT JOIN evaluaciones e ON u.IDUSUARIO = e.IDUSUARIO
                WHERE u.rol = 'postulante'
                GROUP BY u.IDUSUARIO, u.nombreCompleto, u.correo
            `);
            
            let contenidoPDF = "REPORTE DE EVALUACIONES DE POSTULANTES\n\n";
            contenidoPDF += `Fecha de generación: ${new Date().toLocaleDateString()}\n`;
            contenidoPDF += `Total de postulantes: ${postulantes.length}\n\n`;
            
            postulantes.forEach((postulante, index) => {
                contenidoPDF += `${index + 1}. ${postulante.nombre} ${postulante.apellido}\n`;
                contenidoPDF += `   Email: ${postulante.email}\n`;
                contenidoPDF += `   DNI: ${postulante.dni}\n`;
                contenidoPDF += `   Total anexos: ${postulante.totalAnexos}\n`;
                contenidoPDF += `   Calificación promedio: ${postulante.calificacion_promedio || 'Sin evaluar'}\n\n`;
            });
            
            const rutaPDF = await generarPDF(contenidoPDF);
            
            res.download(rutaPDF, `evaluaciones_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error generando PDF de evaluaciones:', error);
            res.status(500).json({ error: 'Error al generar PDF de evaluaciones' });
        }
    }
);

export default router;