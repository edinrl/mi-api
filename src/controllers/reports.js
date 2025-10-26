import { pool } from '../database/conexion.js';
import PDFDocument from 'pdfkit';
import stream from 'stream';
import { obtenerConvocatorias } from './convocatorias.js'; // Import to fetch convocatorias data
import { _obtenerDocumentosPorUsuarioInternal, _obtenerAnexosPorUsuarioInternal, _obtenerCurriculumPorUsuarioInternal, _obtenerCertificadosPorUsuarioInternal } from './documentos.js'; // Import to fetch documents/annexes/curriculum/certificates data
import { _obtenerUsuariosInternal } from './usuarios.js'; // Import to fetch user data internally

// Crear un nuevo reporte
export const crearReporte = async (req, res) => {
    const { nombreReporte, descripcion, tipoReporte, parametrosConfiguracion } = req.body;
    const IDUSUARIO_CREADOR = req.user.id; // Asume que el ID del usuario está en req.user.id

    if (!nombreReporte || !tipoReporte || !IDUSUARIO_CREADOR) {
        return res.status(400).json({ message: 'Nombre del reporte, tipo de reporte y ID de usuario creador son obligatorios.' });
    }

    try {
        let reportContentBuffer = null;
        let reportFileName = `${nombreReporte}.pdf`;
        let reportFileType = 'application/pdf';

        // --- Logic for PDF generation based on tipoReporte --- 
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            reportContentBuffer = Buffer.concat(buffers);
        });

        doc.fontSize(20).text(nombreReporte, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Descripción: ${descripcion || 'N/A'}`);
        doc.text(`Tipo de Reporte: ${tipoReporte}`);
        doc.text(`Fecha de Creación: ${new Date().toLocaleDateString('es-ES')}`);
        doc.moveDown();

        const parsedParametros = parametrosConfiguracion ? JSON.parse(parametrosConfiguracion) : {};

        switch (tipoReporte) {
            case 'Convocatorias':
                const convocatoriasResult = await obtenerConvocatorias({ query: parsedParametros });
                if (convocatoriasResult && convocatoriasResult.length > 0) {
                    doc.fontSize(16).text('Detalle de Convocatorias:');
                    convocatoriasResult.forEach(convocatoria => {
                        doc.fontSize(12).text(`- ${convocatoria.puesto} (${convocatoria.area}) - Estado: ${convocatoria.estado}`);
                    });
                } else {
                    doc.fontSize(12).text('No se encontraron convocatorias para este reporte.');
                }
                break;
            case 'Anexos':
                const IDUSUARIO_ANEXO = parsedParametros.IDUSUARIO || req.user.id;
                if (!IDUSUARIO_ANEXO) {
                    return res.status(400).json({ message: 'ID de usuario no proporcionado para el reporte de anexos.' });
                }
                doc.fontSize(16).text('Detalle de Anexos por Usuario:', { underline: true });
                doc.moveDown();
                const anexosData = await _obtenerAnexosPorUsuarioInternal(IDUSUARIO_ANEXO);
                if (anexosData && anexosData.length > 0) {
                    anexosData.forEach(anexo => {
                        doc.fontSize(12).text(`- Convocatoria: ${anexo.nombrePuestoConvocatoria}`);
                        doc.fontSize(10).text(`  Postulante: ${anexo.nombrePostulante}, DNI: ${anexo.dniPostulante}`);
                        doc.fontSize(10).text(`  Archivo: ${anexo.nombreArchivoPDF}, Subido: ${new Date(anexo.fechaSubida).toLocaleDateString('es-ES')}`);
                        doc.moveDown(0.5);
                    });
                } else {
                    doc.fontSize(12).text(`No se encontraron anexos para el usuario con ID: ${IDUSUARIO_ANEXO}.`);
                }
                break;
            case 'Curriculum':
                const IDUSUARIO_CURRICULUM = parsedParametros.IDUSUARIO || req.user.id;
                if (!IDUSUARIO_CURRICULUM) {
                    return res.status(400).json({ message: 'ID de usuario no proporcionado para el reporte de currículums.' });
                }
                doc.fontSize(16).text('Detalle de Currículums por Usuario:', { underline: true });
                doc.moveDown();
                const curriculumData = await _obtenerCurriculumPorUsuarioInternal(IDUSUARIO_CURRICULUM);
                if (curriculumData && curriculumData.length > 0) {
                    curriculumData.forEach(curriculum => {
                        doc.fontSize(12).text(`- Archivo: ${curriculum.nombreArchivo}`);
                        doc.fontSize(10).text(`  Tipo: ${curriculum.tipoArchivo}, Tamaño: ${curriculum.tamanoArchivo} bytes`);
                        doc.fontSize(10).text(`  Subido: ${new Date(curriculum.fechaSubida).toLocaleDateString('es-ES')}`);
                        doc.moveDown(0.5);
                    });
                } else {
                    doc.fontSize(12).text(`No se encontraron currículums para el usuario con ID: ${IDUSUARIO_CURRICULUM}.`);
                }
                break;
            case 'Certificados':
                const IDUSUARIO_CERTIFICADO = parsedParametros.IDUSUARIO || req.user.id;
                if (!IDUSUARIO_CERTIFICADO) {
                    return res.status(400).json({ message: 'ID de usuario no proporcionado para el reporte de certificados.' });
                }
                doc.fontSize(16).text('Detalle de Certificados por Usuario:', { underline: true });
                doc.moveDown();
                const certificadosData = await _obtenerCertificadosPorUsuarioInternal(IDUSUARIO_CERTIFICADO);
                if (certificadosData && certificadosData.length > 0) {
                    certificadosData.forEach(certificado => {
                        doc.fontSize(12).text(`- Archivo: ${certificado.nombreArchivo}`);
                        doc.fontSize(10).text(`  Tipo: ${certificado.tipoArchivo}, Generado: ${new Date(certificado.fechaGeneracion).toLocaleDateString('es-ES')}`);
                        doc.moveDown(0.5);
                    });
                } else {
                    doc.fontSize(12).text(`No se encontraron certificados para el usuario con ID: ${IDUSUARIO_CERTIFICADO}.`);
                }
                break;
            case 'Usuarios':
                const IDUSUARIO_REPORTE = parsedParametros.IDUSUARIO || req.user.id; 

                if (!IDUSUARIO_REPORTE) {
                    return res.status(400).json({ message: 'ID de usuario no proporcionado para el reporte de usuarios.' });
                }

                const userDataResult = await _obtenerUsuariosInternal({ IDUSUARIO: IDUSUARIO_REPORTE.toString() }); 
                const userData = userDataResult[0];

                if (!userData) {
                    doc.fontSize(12).text(`No se encontró el usuario con ID: ${IDUSUARIO_REPORTE}.`);
                    break;
                }

                doc.fontSize(16).text('Detalle del Postulante:', { underline: true });
                doc.moveDown();

                doc.fontSize(14).text(`Nombre Completo: ${userData.nombreCompleto || 'N/A'}`);
                doc.text(`Correo: ${userData.correo || 'N/A'}`);
                doc.text(`Rol: ${userData.rol || 'N/A'}`);
                doc.text(`Estado: ${userData.estado || 'N/A'}`);
                doc.text(`Fecha de Creación: ${new Date(userData.fechaCreacion).toLocaleDateString('es-ES') || 'N/A'}`);
                doc.moveDown();

                // --- Curriculum --- 
                doc.fontSize(14).text('Currículum:', { underline: true });
                const userCurriculumData = await _obtenerCurriculumPorUsuarioInternal(IDUSUARIO_REPORTE);
                if (userCurriculumData && userCurriculumData.length > 0) {
                    userCurriculumData.forEach(curriculum => {
                        doc.fontSize(12).text(`- Archivo: ${curriculum.nombreArchivo} (Tipo: ${curriculum.tipoArchivo}, Tamaño: ${curriculum.tamanoArchivo} bytes)`);
                    });
                } else {
                    doc.fontSize(12).text('No se encontraron currículums para este usuario.');
                }
                doc.moveDown();

                // --- Anexos --- 
                doc.fontSize(14).text('Anexos:', { underline: true });
                const userAnexosData = await _obtenerAnexosPorUsuarioInternal(IDUSUARIO_REPORTE);
                if (userAnexosData && userAnexosData.length > 0) {
                    userAnexosData.forEach(anexo => {
                        doc.fontSize(12).text(`- Convocatoria: ${anexo.nombrePuestoConvocatoria} (DNI: ${anexo.dniPostulante}) - Archivo: ${anexo.nombreArchivoPDF}`);
                    });
                } else {
                    doc.fontSize(12).text('No se encontraron anexos para este usuario.');
                }
                doc.moveDown();

                // --- Certificados --- 
                doc.fontSize(14).text('Certificados:', { underline: true });
                const userCertificadosData = await _obtenerCertificadosPorUsuarioInternal(IDUSUARIO_REPORTE);
                if (userCertificadosData && userCertificadosData.length > 0) {
                    userCertificadosData.forEach(certificado => {
                        doc.fontSize(12).text(`- Archivo: ${certificado.nombreArchivo} (Tipo: ${certificado.tipoArchivo}) - Generado: ${new Date(certificado.fechaGeneracion).toLocaleDateString('es-ES')}`);
                    });
                } else {
                    doc.fontSize(12).text('No se encontraron certificados para este usuario.');
                }
                break;
            default:
                doc.fontSize(12).text('Tipo de reporte no reconocido o en desarrollo.');
        }

        doc.end();

        await new Promise(resolve => doc.on('end', resolve));

        const [result] = await pool.execute(`INSERT INTO Reports (
                nombreReporte, descripcion, tipoReporte, parametrosConfiguracion,
                reportContent, reportFileName, reportFileType, IDUSUARIO_CREADOR
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                nombreReporte, descripcion, tipoReporte, 
                parametrosConfiguracion ? JSON.stringify(parametrosConfiguracion) : null,
                reportContentBuffer, reportFileName, reportFileType, IDUSUARIO_CREADOR
            ]);

        res.status(201).json({ message: 'Reporte creado exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error al crear reporte:', error);
        res.status(500).json({ message: 'Error del servidor al crear el reporte.', error: error.message });
    }
};

// Obtener todos los reportes
export const obtenerReportes = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT IDREPORT, nombreReporte, descripcion, tipoReporte, parametrosConfiguracion, fechaCreacion, IDUSUARIO_CREADOR FROM Reports');

        const reports = rows.map(report => ({
            ...report,
            parametrosConfiguracion: report.parametrosConfiguracion ? JSON.parse(report.parametrosConfiguracion) : null,
        }));

        res.status(200).json(reports);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({ message: 'Error del servidor al obtener los reportes.', error: error.message });
    }
};

// Obtener un reporte por ID
export const obtenerReportePorId = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.execute('SELECT IDREPORT, nombreReporte, descripcion, tipoReporte, parametrosConfiguracion, fechaCreacion, IDUSUARIO_CREADOR FROM Reports WHERE IDREPORT = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Reporte no encontrado.' });
        }

        const report = {
            ...rows[0],
            parametrosConfiguracion: rows[0].parametrosConfiguracion ? JSON.parse(rows[0].parametrosConfiguracion) : null,
        };

        res.status(200).json(report);
    } catch (error) {
        console.error('Error al obtener reporte por ID:', error);
        res.status(500).json({ message: 'Error del servidor al obtener el reporte por ID.', error: error.message });
    }
};

// Actualizar un reporte
export const actualizarReporte = async (req, res) => {
    const { id } = req.params;
    const { nombreReporte, descripcion, tipoReporte, parametrosConfiguracion } = req.body;

    if (!nombreReporte || !tipoReporte) {
        return res.status(400).json({ message: 'Nombre del reporte y tipo de reporte son obligatorios.' });
    }

    try {
        const [result] = await pool.execute(`UPDATE Reports
                    SET
                        nombreReporte = ?,
                        descripcion = ?,
                        tipoReporte = ?,
                        parametrosConfiguracion = ?
                    WHERE IDREPORT = ?`, [
                        nombreReporte, 
                        descripcion, 
                        tipoReporte, 
                        parametrosConfiguracion ? JSON.stringify(parametrosConfiguracion) : null,
                        id
                    ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Reporte no encontrado para actualizar o no se realizaron cambios.' });
        }

        res.status(200).json({ message: 'Reporte actualizado exitosamente.' });
    } catch (error) {
        console.error('Error al actualizar reporte:', error);
        res.status(500).json({ message: 'Error del servidor al actualizar el reporte.', error: error.message });
    }
};

// Eliminar un reporte
export const eliminarReporte = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute('DELETE FROM Reports WHERE IDREPORT = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Reporte no encontrado para eliminar o ya fue eliminado.' });
        }

        res.status(200).json({ message: 'Reporte eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar reporte:', error);
        res.status(500).json({ message: 'Error del servidor al eliminar el reporte.', error: error.message });
    }
};

// Descargar un reporte PDF generado
export const downloadReporte = async (req, res) => {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    if (isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({ message: 'ID de reporte inválido.' });
    }

    try {
        const [rows] = await pool.execute('SELECT reportContent, reportFileName, reportFileType FROM Reports WHERE IDREPORT = ?', [parsedId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Reporte no encontrado.' });
        }

        const report = rows[0];

        if (!report.reportContent) {
            return res.status(404).json({ message: 'El reporte no tiene contenido PDF generado.' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${report.reportFileName || 'report.pdf'}"`);
        res.setHeader('Content-Type', report.reportFileType || 'application/pdf');
        res.send(report.reportContent);

    } catch (error) {
        console.error('Error al descargar reporte:', error);
        res.status(500).json({ message: 'Error del servidor al descargar el reporte.', error: error.message });
    }
};

export const obtenerDatosGraficoPostulantes = async (req, res) => {
    try {
        // Define el período de tiempo (ej. últimos 30 días)
        const queryDays = req.query.timeframe === '7d' ? 7 : req.query.timeframe === '30d' ? 30 : 90; // Default 90 days
        
        // For MySQL, use a recursive CTE to generate date series (or a numbers table)
        const [rows] = await pool.execute(`
                WITH RECURSIVE DateSeries AS (
                    SELECT CURDATE() AS ReportDate
                    UNION ALL
                    SELECT DATE_SUB(ReportDate, INTERVAL 1 DAY)
                    FROM DateSeries
                    WHERE ReportDate > DATE_SUB(CURDATE(), INTERVAL ? DAY)
                )
                SELECT
                    DATE_FORMAT(DS.ReportDate, '%Y-%m-%d') AS date,
                    COUNT(DISTINCT CASE WHEN U.rol = 'postulante' THEN U.IDUSUARIO ELSE NULL END) AS postulantes,
                    COUNT(DISTINCT CASE WHEN D.tipoArchivo = 'curriculum' THEN D.IDDOCUMENTO ELSE NULL END) AS cvs,
                    COUNT(DISTINCT CASE WHEN A.IDANEXO IS NOT NULL THEN A.IDANEXO ELSE NULL END) AS anexos
                FROM DateSeries DS
                LEFT JOIN USUARIOS U ON DATE(U.fechaCreacion) = DS.ReportDate
                LEFT JOIN Documentos D ON DATE(D.fechaSubida) = DS.ReportDate AND U.IDUSUARIO = D.IDUSUARIO
                LEFT JOIN Anexos A ON DATE(A.fechaSubida) = DS.ReportDate AND U.IDUSUARIO = A.IDUSUARIO
                GROUP BY DS.ReportDate
                ORDER BY DS.ReportDate;
            `, [queryDays]);

        res.status(200).json(rows);

    } catch (error) {
        console.error('Error al obtener datos del gráfico de postulantes:', error);
        res.status(500).json({ message: 'Error del servidor al obtener datos del gráfico.', error: error.message });
    }
};
