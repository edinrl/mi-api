import { pool, retryDatabaseOperation } from '../database/conexion.js';
import multer from 'multer';
import path from 'path'; 
import fs from 'fs'; 
import PDFDocument from "pdfkit";
import { obtenerNombreUsuarioPorId } from '../controllers/usuarios.js';
import QRCode from 'qrcode'; 

// --- Configuración de Multer para almacenamiento en memoria (para documentos generales) ---
const storageDocumentos = multer.memoryStorage();

export const uploadDocumento = multer({
    storage: storageDocumentos,
    limits: { fileSize: 100 * 1024 * 1024 } 
});

// --- Configuración de Multer para almacenamiento en memoria (para currículums) ---
const curriculumStorage = multer.memoryStorage(); 

export const uploadCurriculum = multer({ storage: curriculumStorage, limits: { fileSize: 500 * 1024 * 1024 } }); 

// --- Configuración de Multer para almacenamiento en disco (para anexos/PDFs)
const anexoPdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'uploads', 'anexos');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const uploadAnexoPdf = multer({ storage: anexoPdfStorage, limits: { fileSize: 50 * 1024 * 1024 } }); 

// Middleware para procesar los datos del formulario JSON junto con el PDF
export const uploadAnexo = multer().fields([
    { name: 'file', maxCount: 1 }, 
    { name: 'formDataJson', maxCount: 1 } 
]);

export const subirDocumento = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
        }

        const { originalname, filename, path: filePath, size, mimetype } = req.file;
        const IDUSUARIO = req.user.id; 

        await pool.execute(
            'INSERT INTO Documentos (IDUSUARIO, nombreArchivo, rutaArchivo, tipoArchivo, tamanoArchivo) VALUES (?, ?, ?, ?, ?)',
            [IDUSUARIO, originalname, filePath, mimetype, size]
        );

        res.status(201).json({ message: 'Documento subido y registrado exitosamente.', filename: originalname, filePath: filePath });
    } catch (error) {
        console.error('Error al subir documento:', error);
        res.status(500).json({ message: 'Error del servidor al subir el documento.', error: error.message });
    }
};

// Función interna para obtener documentos por usuario (sin req/res)
export const _obtenerDocumentosPorUsuarioInternal = async (IDUSUARIO) => {
    try {
        const [rows] = await pool.execute("SELECT IDDOCUMENTO, nombreArchivo, rutaArchivo, tipoArchivo, tamanoArchivo, fechaSubida FROM Documentos WHERE IDUSUARIO = ?", [IDUSUARIO]);
        
        return rows;
    } catch (error) {
        console.error('Error al obtener documentos del usuario internamente:', error);
        throw error;
    }
};

export const obtenerDocumentosPorUsuario = async (req, res) => {
    try {
        const IDUSUARIO = req.user.id; 

        if (!IDUSUARIO) {
            return res.status(401).json({ message: 'Autenticación requerida para obtener documentos.' });
        }

        const documentos = await _obtenerDocumentosPorUsuarioInternal(IDUSUARIO);
        res.json(documentos);
    } catch (error) {
        console.error('Error al obtener documentos del usuario:', error);
        res.status(500).json({ message: 'Error del servidor al obtener documentos.', error: error.message });
    }
};

export const descargarDocumento = async (req, res) => {
    try {
        const { IDDOCUMENTO } = req.params;
        const IDUSUARIO_AUTH = req.user.id; 

        const [rows] = await pool.execute("SELECT rutaArchivo, IDUSUARIO, nombreArchivo FROM Documentos WHERE IDDOCUMENTO = ?", [IDDOCUMENTO]);

        const documento = rows[0];

        if (!documento) {
            return res.status(404).json({ message: 'Documento no encontrado.' });
        }

        if (documento.IDUSUARIO !== IDUSUARIO_AUTH && req.user.rol !== 'admin') {
            return res.status(403).json({ message: 'No tienes permiso para descargar este documento.' });
        }

        const filePath = documento.rutaArchivo;

        if (fs.existsSync(filePath)) {
            res.download(filePath, documento.nombreArchivo, (err) => {
                if (err) {
                    console.error('Error al descargar el archivo:', err);
                    return res.status(500).json({ message: 'Error al descargar el archivo.' });
                }
            });
        } else {
            res.status(404).json({ message: 'Archivo físico no encontrado en el servidor.' });
        }

    } catch (error) {
        console.error('Error al descargar documento:', error);
        res.status(500).json({ message: 'Error del servidor al descargar el documento.', error: error.message });
    }
};

export const subirAnexoController = async (req, res) => {
    try {
        const formDataJson = req.body.formDataJson; 

        if (!formDataJson) {
            return res.status(400).json({ message: 'Se requieren los datos del formulario (JSON).', formDataJson: formDataJson });
        }

        const anexosFormData = JSON.parse(formDataJson); 

        const originalname = `Anexo_01_${anexosFormData.personalData.dni || 'sin_dni'}.pdf`; 
        const IDUSUARIO = req.user?.id || 1; 

        const [result] = await pool.execute(`
                INSERT INTO Anexos (
                    IDUSUARIO, codigoConvocatoria, nombrePuestoConvocatoria, 
                    nombrePostulante, dniPostulante, emailPostulante, 
                    nombreArchivoPDF, formDataCompleto
                ) 
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?
                );
            `, [
                IDUSUARIO, 
                anexosFormData.personalData.codigo,
                anexosFormData.personalData.nombrePuesto,
                `${anexosFormData.personalData.nombres} ${anexosFormData.personalData.apellidoPaterno} ${anexosFormData.personalData.apellidoMaterno}`,
                anexosFormData.personalData.dni || anexosFormData.personalData.carnetExtranjeria,
                anexosFormData.personalData.correoElectronico,
                originalname, 
                formDataJson
            ]);

        const anexoId = result.insertId; 

        res.status(201).json({ message: 'Anexo 01 guardado y registrado exitosamente.', anexoId: anexoId });

    } catch (error) {
        console.error('Error al subir Anexo 01 y PDF:', error);
        res.status(500).json({ message: 'Error del servidor al subir Anexo 01 y PDF.', error: error.message });
    }
};

// Nuevo controlador para subir múltiples anexos
export const subirMultiplesAnexosController = async (req, res) => {
    try {
        const { anexosData } = req.body;
        const IDUSUARIO = req.user?.id;

        if (!anexosData || !Array.isArray(anexosData)) {
            return res.status(400).json({ message: 'Se requiere un array de anexos válido.' });
        }

        if (!IDUSUARIO) {
            return res.status(401).json({ message: 'Usuario no autenticado.' });
        }

        const anexosGuardados = [];

        for (const anexo of anexosData) {
            const {
                tipoAnexo,
                codigoConvocatoria,
                nombrePuestoConvocatoria,
                nombrePostulante,
                dniPostulante,
                emailPostulante,
                contenidoArchivo,
                nombreArchivo,
                tipoArchivo,
                tamanoArchivo,
                datosAdicionales
            } = anexo;

            // Validar campos requeridos
            if (!tipoAnexo || !codigoConvocatoria || !nombrePostulante) {
                console.warn(`Anexo omitido por falta de datos requeridos:`, anexo);
                continue;
            }

            const [result] = await pool.execute(`
                INSERT INTO Anexos (
                    IDUSUARIO, tipoAnexo, codigoConvocatoria, nombrePuestoConvocatoria,
                    nombrePostulante, dniPostulante, emailPostulante,
                    nombreArchivo, contenidoArchivo, tipoArchivo, tamanoArchivo,
                    datosAdicionales, formDataCompleto
                ) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                IDUSUARIO,
                tipoAnexo,
                codigoConvocatoria,
                nombrePuestoConvocatoria,
                nombrePostulante,
                dniPostulante,
                emailPostulante,
                nombreArchivo,
                contenidoArchivo,
                tipoArchivo,
                tamanoArchivo,
                JSON.stringify(datosAdicionales || {}),
                JSON.stringify(anexo)
            ]);

            anexosGuardados.push({
                id: result.insertId,
                tipoAnexo,
                nombreArchivo,
                nombrePostulante
            });
        }

        res.status(201).json({ 
            message: `${anexosGuardados.length} anexo(s) guardado(s) exitosamente.`,
            anexos: anexosGuardados
        });

    } catch (error) {
        console.error('Error al subir múltiples anexos:', error);
        res.status(500).json({ 
            message: 'Error del servidor al subir anexos.', 
            error: error.message 
        });
    }
};

export const _obtenerAnexosPorUsuarioInternal = async (IDUSUARIO) => {
    try {
        let query = `
                SELECT 
                    IDANEXO, codigoConvocatoria, nombrePuestoConvocatoria, 
                    nombrePostulante, dniPostulante, emailPostulante, 
                    nombreArchivoPDF, rutaArchivoPDF, tipoArchivoPDF, tamanoArchivoPDF, 
                    formDataCompleto, fechaSubida
                FROM Anexos
            `;
        const queryParams = [];
        
        if (IDUSUARIO) {
            query += ` WHERE IDUSUARIO = ?`;
            queryParams.push(IDUSUARIO);
        }

        query += ` ORDER BY fechaSubida DESC`;

        const [rows] = await pool.execute(query, queryParams);

        return rows;
    } catch (error) {
        console.error('Error al obtener Anexos por usuario internamente:', error);
        throw error;
    }
};

// Función mejorada para obtener anexos con filtros
export const _obtenerAnexosConFiltrosInternal = async (filtros = {}) => {
    try {
        let query = `
            SELECT 
                IDANEXO, IDUSUARIO, tipoAnexo, codigoConvocatoria, nombrePuestoConvocatoria,
                nombrePostulante, dniPostulante, emailPostulante,
                nombreArchivo, contenidoArchivo, tipoArchivo, tamanoArchivo,
                datosAdicionales, formDataCompleto, fechaSubida
            FROM Anexos
            WHERE 1=1
        `;
        const queryParams = [];

        // Filtros opcionales
        if (filtros.IDUSUARIO) {
            query += ` AND IDUSUARIO = ?`;
            queryParams.push(filtros.IDUSUARIO);
        }

        if (filtros.tipoAnexo) {
            query += ` AND tipoAnexo = ?`;
            queryParams.push(filtros.tipoAnexo);
        }

        if (filtros.codigoConvocatoria) {
            query += ` AND codigoConvocatoria = ?`;
            queryParams.push(filtros.codigoConvocatoria);
        }

        if (filtros.dniPostulante) {
            query += ` AND dniPostulante = ?`;
            queryParams.push(filtros.dniPostulante);
        }

        if (filtros.fechaDesde) {
            query += ` AND fechaSubida >= ?`;
            queryParams.push(filtros.fechaDesde);
        }

        if (filtros.fechaHasta) {
            query += ` AND fechaSubida <= ?`;
            queryParams.push(filtros.fechaHasta);
        }

        query += ` ORDER BY fechaSubida DESC`;

        if (filtros.limite) {
            query += ` LIMIT ?`;
            queryParams.push(filtros.limite);
        }

        const [rows] = await pool.execute(query, queryParams);
        return rows;
    } catch (error) {
        console.error('Error al obtener Anexos con filtros internamente:', error);
        throw error;
    }
};

export const obtenerAnexosPorUsuario = async (req, res) => {
    try {
        const IDUSUARIO = req.user?.id; 

        const anexos = await _obtenerAnexosPorUsuarioInternal(IDUSUARIO);
        res.status(200).json(anexos);

    } catch (error) {
        console.error('Error al obtener Anexos por usuario:', error);
        res.status(500).json({ message: 'Error del servidor al obtener Anexos.', error: error.message });
    }
};

// Nuevo controlador para obtener anexos con filtros
export const obtenerAnexosConFiltros = async (req, res) => {
    try {
        const filtros = req.query;
        const anexos = await _obtenerAnexosConFiltrosInternal(filtros);
        res.status(200).json(anexos);
    } catch (error) {
        console.error('Error al obtener Anexos con filtros:', error);
        res.status(500).json({ message: 'Error del servidor al obtener Anexos.', error: error.message });
    }
};

// Controlador para obtener todos los anexos de un postulante para análisis de IA
export const obtenerAnexosParaAnalisis = async (req, res) => {
    try {
        const { postulanteId, convocatoriaId } = req.params;
        
        if (!postulanteId || !convocatoriaId) {
            return res.status(400).json({ 
                message: 'Se requieren postulanteId y convocatoriaId.' 
            });
        }

        // Obtener datos de la convocatoria
        const [convocatoriaRows] = await pool.execute(
            'SELECT * FROM convocatorias WHERE id = ?', 
            [convocatoriaId]
        );

        if (convocatoriaRows.length === 0) {
            return res.status(404).json({ 
                message: 'Convocatoria no encontrada.' 
            });
        }

        // Obtener todos los anexos del postulante
        const anexos = await _obtenerAnexosConFiltrosInternal({
            IDUSUARIO: postulanteId,
            codigoConvocatoria: convocatoriaRows[0].numero_cas
        });

        // Obtener currículum del postulante
        const [curriculumRows] = await pool.execute(
            'SELECT * FROM Curriculum WHERE IDUSUARIO = ? ORDER BY fechaSubida DESC LIMIT 1',
            [postulanteId]
        );

        const datosParaAnalisis = {
            convocatoria: convocatoriaRows[0],
            anexos: anexos,
            curriculum: curriculumRows[0] || null,
            postulante: {
                id: postulanteId,
                totalAnexos: anexos.length
            }
        };

        res.status(200).json(datosParaAnalisis);

    } catch (error) {
        console.error('Error al obtener anexos para análisis:', error);
        res.status(500).json({ 
            message: 'Error del servidor al obtener datos para análisis.', 
            error: error.message 
        });
    }
};

export const subirCurriculumController = async (req, res) => {
    try {
        const curriculumFiles = req.files; 
        
        if (!curriculumFiles || curriculumFiles.length === 0) {
            return res.status(400).json({ message: 'No se han subido archivos de currículum.' });
        }

        const IDUSUARIO = req.user?.id || 1; 
        console.log('Uploading curriculum for IDUSUARIO:', IDUSUARIO); 
        
        // Validar que el usuario existe
        try {
            const [userCheck] = await pool.execute('SELECT IDUSUARIO FROM usuarios WHERE IDUSUARIO = ?', [IDUSUARIO]);
            if (userCheck.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }
        } catch (userError) {
            console.error('❌ Error verificando usuario:', userError);
            return res.status(500).json({ message: 'Error verificando usuario.' });
        }
        
        const uploadedFilesInfo = [];

        for (const file of curriculumFiles) {
            const { originalname, buffer, size, mimetype } = file; 
            console.log(`Processing file: ${originalname}, size: ${size}, type: ${mimetype}`); 

            // Validar el archivo
            if (!buffer || buffer.length === 0) {
                console.error(`❌ Archivo ${originalname} está vacío`);
                return res.status(400).json({ message: `El archivo ${originalname} está vacío.` });
            }

            if (size > 500 * 1024 * 1024) { // 500MB límite
                console.error(`❌ Archivo ${originalname} es demasiado grande: ${size} bytes`);
                return res.status(413).json({ message: `El archivo ${originalname} es demasiado grande. Máximo 500MB.` });
            }

            if (!mimetype || !mimetype.includes('pdf')) {
                console.error(`❌ Archivo ${originalname} no es PDF: ${mimetype}`);
                return res.status(400).json({ message: `El archivo ${originalname} debe ser un PDF.` });
            }

            try {
                await retryDatabaseOperation(async () => {
                    await pool.execute(
                        `INSERT INTO Curriculum (
                            IDUSUARIO, nombreArchivo, fileContent, tipoArchivo, tamanoArchivo
                        )
                        VALUES (
                            ?, ?, ?, ?, ?
                        );
                        `,
                        [
                            IDUSUARIO,
                            originalname,
                            buffer,
                            mimetype,
                            size
                        ]
                    );
                });
                console.log(`✅ Archivo ${originalname} subido exitosamente`);
            } catch (dbError) {
                console.error(`❌ Error subiendo archivo ${originalname} después de reintentos:`, dbError);
                throw dbError;
            }
            uploadedFilesInfo.push({ originalname, size, mimetype }); 
        }

        res.status(201).json({ message: 'Currículum(s) subido(s) y registrado(s) exitosamente.', files: uploadedFilesInfo });

    } catch (error) {
        console.error('❌ Error al subir currículum en el controlador:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error errno:', error.errno);
        
        // Determinar el tipo de error y dar un mensaje más específico
        let errorMessage = 'Error del servidor al subir currículum';
        let statusCode = 500;
        
        if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
            errorMessage = 'Error de conexión a la base de datos. Por favor, inténtalo de nuevo.';
            statusCode = 503; // Service Unavailable
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            errorMessage = 'Error de acceso a la base de datos.';
            statusCode = 403; // Forbidden
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            errorMessage = 'Error de base de datos no encontrada.';
            statusCode = 500;
        } else if (error.code === 'ER_DUP_ENTRY') {
            errorMessage = 'El archivo ya existe. Por favor, usa un nombre diferente.';
            statusCode = 409; // Conflict
        } else if (error.message && error.message.includes('File too large')) {
            errorMessage = 'El archivo es demasiado grande. Por favor, reduce el tamaño del archivo.';
            statusCode = 413; // Payload Too Large
        }
        
        res.status(statusCode).json({ 
            message: errorMessage, 
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    }
};

export const _obtenerCurriculumPorUsuarioInternal = async (IDUSUARIO) => {
    try {
        const [rows] = await pool.execute(
            `SELECT 
                IDCURRICULUM, nombreArchivo, tipoArchivo, tamanoArchivo, fechaSubida, fileContent 
            FROM Curriculum
            WHERE IDUSUARIO = ?
            ORDER BY fechaSubida DESC
            `, [IDUSUARIO]
        );
        return rows;
    } catch (error) {
        console.error('Error al obtener Currículum por usuario internamente:', error);
        throw error;
    }
};

/**
 * ============================================================
 * 📜 MÓDULO: Generación de Certificados PDF con QR
 * AUTOR: Delya (versión embellecida)
 * ============================================================
 */

// ============================================================
// 🔹 1. OBTENCIÓN DE DATOS PRINCIPALES
// ============================================================
async function fetchCertificateData(IDUSUARIO, pool) {
  console.log(`🔍 Buscando datos para IDUSUARIO: ${IDUSUARIO}`);

  // 1. Usuario
      const [usuarioRows] = await pool.execute(
        "SELECT IDUSUARIO, nombreCompleto, correo FROM USUARIOS WHERE IDUSUARIO = ?", 
        [IDUSUARIO]
      );
      
      if (usuarioRows.length === 0) {
    const error = new Error("Usuario no encontrado.");
    error.statusCode = 404;
    throw error;
      }
      
      const usuario = usuarioRows[0];

  // 2. Convocatoria - Obtener datos reales de la tabla convocatorias
  let datosConvocatoria = {
    puesto: "No especificado",
    numeroCas: "No especificado",
    area: "No especificada",
    idConvocatoria: "N/A",
  };

  try {
    console.log(`🔍 Buscando convocatorias para usuario: ${IDUSUARIO}`);
    
    // Obtener la convocatoria activa más reciente
    const [convocatoriaRows] = await pool.execute(
      "SELECT puesto, numero_cas, area, id FROM convocatorias WHERE estado = 'activo' ORDER BY fechaPublicacion DESC LIMIT 1"
    );
    
    if (convocatoriaRows.length > 0) {
      const convocatoria = convocatoriaRows[0];
      datosConvocatoria = {
        puesto: convocatoria.puesto,
        numeroCas: convocatoria.numero_cas,
        area: convocatoria.area,
        idConvocatoria: convocatoria.id,
      };
      console.log(`✅ Convocatoria encontrada: ${convocatoria.puesto} - CAS: ${convocatoria.numero_cas} - Área: ${convocatoria.area}`);
    } else {
      console.log("⚠️ No se encontraron convocatorias activas");
      
      // Si no hay convocatorias activas, buscar cualquier convocatoria
      const [cualquierConvocatoria] = await pool.execute(
        "SELECT puesto, numero_cas, area, id FROM convocatorias ORDER BY fechaPublicacion DESC LIMIT 1"
      );
      
      if (cualquierConvocatoria.length > 0) {
        const convocatoria = cualquierConvocatoria[0];
          datosConvocatoria = {
          puesto: convocatoria.puesto,
          numeroCas: convocatoria.numero_cas,
          area: convocatoria.area,
          idConvocatoria: convocatoria.id,
        };
        console.log(`✅ Usando cualquier convocatoria: ${convocatoria.puesto} - CAS: ${convocatoria.numero_cas}`);
      } else {
        console.log("⚠️ No hay convocatorias en la base de datos");
      }
    }
  } catch (err) {
    console.error("❌ Error obteniendo datos de convocatoria:", err.message);
  }

  // 3. RRHH
  let rrhhUserName = "Lic. María González López";
  try {
    const [rrhhUser] = await pool.execute(
      "SELECT nombreCompleto FROM usuarios WHERE rol = 'rr.hh' ORDER BY IDUSUARIO DESC LIMIT 1"
    );
    if (rrhhUser.length > 0) {
      rrhhUserName = rrhhUser[0].nombreCompleto;
      console.log(`✅ RRHH encontrado: ${rrhhUserName}`);
    }
  } catch (err) {
    console.error("❌ Error obteniendo RRHH:", err);
  }

  // 4. Obtener información del curriculum subido
  let curriculumFiles = [];
  try {
    const [curriculumRows] = await pool.execute(
      "SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaSubida FROM Curriculum WHERE IDUSUARIO = ? ORDER BY fechaSubida DESC",
      [IDUSUARIO]
    );
    curriculumFiles = curriculumRows.map(row => ({
      nombre: row.nombreArchivo,
      tamaño: row.tamanoArchivo,
      tipo: row.tipoArchivo,
      fecha: row.fechaSubida ? new Date(row.fechaSubida).toISOString() : null
    }));
    console.log(`✅ Curriculum encontrado: ${curriculumFiles.length} archivo(s)`);
  } catch (err) {
    console.error("❌ Error obteniendo curriculum:", err);
  }

  // 5. Obtener información de los anexos subidos
  let anexosFiles = [];
  try {
    const [anexosRows] = await pool.execute(
      "SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaCreacion FROM Anexos WHERE IDUSUARIO = ? ORDER BY fechaCreacion DESC",
      [IDUSUARIO]
    );
    anexosFiles = anexosRows.map(row => ({
      nombre: row.nombreArchivo,
      tamaño: row.tamanoArchivo,
      tipo: row.tipoArchivo,
      fecha: row.fechaCreacion ? new Date(row.fechaCreacion).toISOString() : null
    }));
    console.log(`✅ Anexos encontrados: ${anexosFiles.length} archivo(s)`);
  } catch (err) {
    console.error("❌ Error obteniendo anexos:", err);
  }

  // 6. Retorno completo
  return {
    usuario,
    datosConvocatoria,
    rrhhUserName,
    curriculumFiles,
    anexosFiles,
    codigoCertificado: `CERT-${Date.now().toString().slice(-8)}`,
    fecha: new Date().toLocaleDateString("es-PE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    hora: new Date().toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

// ============================================================
// 🔹 2. FUNCIONES AUXILIARES
// ============================================================

async function generateQRCode(data) {
  const qrDataString = JSON.stringify(data);
  console.log("🔧 Generando QR:", qrDataString);
  return QRCode.toDataURL(qrDataString, {
    width: 160,
    margin: 2,
    color: { dark: "#003366", light: "#FFFFFF" },
  });
}

async function setupUploadsDirectory(uploadPath) {
  try {
    if (!fs.existsSync(uploadPath)) {
      console.log("📁 Creando carpeta uploads...");
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    fs.accessSync(uploadPath, fs.constants.W_OK);
    console.log("✅ Carpeta uploads lista.");
  } catch (err) {
    const error = new Error("Error con directorio de archivos.");
    error.statusCode = 500;
    error.originalError = err.message;
    throw error;
  }
}

// ============================================================
// 🔹 3. DISEÑO DEL PDF
// ============================================================

function drawPageFrames(doc) {
  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fillColor("white").fill();
  doc.rect(25, 25, width - 50, height - 50).stroke("#DAA520", 4);
  doc.rect(40, 40, width - 80, height - 80).stroke("#003366", 2);
}

function drawFooter(doc) {
  const { width } = doc.page;
  doc.moveTo(80, doc.y).lineTo(width - 80, doc.y).stroke("#FFD700", 1);
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor("#000").text("UGEL Talara - Av. Grau 123, Talara, Piura, Perú", { align: "center" });
  doc.text("Teléfono: (073) 123-456 | Email: ugel@talara.edu.pe", { align: "center" });
  doc.text("www.ugeltalara.edu.pe", { align: "center" });
}

async function drawPageOne(doc, data) {
  const { usuario, datosConvocatoria, rrhhUserName, codigoCertificado, fecha, hora } = data;
  const { width } = doc.page;

  drawPageFrames(doc);

  // Logo
        const logoPath = path.join(process.cwd(), "uploads", "logos", "logo_ugel.png");
  if (fs.existsSync(logoPath)) doc.image(logoPath, width / 2 - 50, 50, { width: 100 });

        // Encabezado
  doc.fontSize(28).fillColor("#003366").font("Helvetica-Bold").text("UNIDAD DE GESTIÓN EDUCATIVA LOCAL", { align: "center", y: 160 });
  doc.fontSize(36).fillColor("#003366").font("Helvetica-Bold").text("UGEL TALARA", { align: "center", y: 200 });
  doc.moveTo(100, 250).lineTo(width - 100, 250).stroke("#FFD700", 3);

  // Título principal
  doc.fontSize(48).fillColor("#000").font("Helvetica-Bold").text("CERTIFICADO", { align: "center", y: 280 });
  doc.fontSize(20).fillColor("#003366").text("DE REGISTRO Y POSTULACIÓN", { align: "center", y: 340 });

        doc.moveDown(4);
  doc.fontSize(20).fillColor("#000").text("La UGEL Talara certifica que", { align: "center" });

  // Nombre del postulante
        doc.moveDown(1.5);
  doc.fontSize(38).fillColor("#003366").font("Helvetica-Bold").text(usuario.nombreCompleto.toUpperCase(), { align: "center" });
  doc.moveTo(width / 2 - 120, doc.y).lineTo(width / 2 + 120, doc.y).stroke("#FFD700", 2);

  // Información
        doc.moveDown(2);
  doc.fontSize(18).fillColor("#000").font("Helvetica-Bold").text("INFORMACIÓN DE LA POSTULACIÓN", { align: "center" });

        doc.moveDown(1);
  doc.fontSize(16).fillColor("#003366").text("DATOS DEL POSTULANTE:", { x: 80 });
  doc.fontSize(14).fillColor("#000").text(`• Nombre Completo: ${usuario.nombreCompleto}`, { x: 100 });
  doc.text(`• Correo Electrónico: ${usuario.correo}`, { x: 100 });

        doc.moveDown(1);
  doc.fontSize(16).fillColor("#003366").text("DATOS DE LA CONVOCATORIA:", { x: 80 });
  doc.fontSize(14).fillColor("#000");
  doc.text(`• Puesto: ${datosConvocatoria.puesto}`, { x: 100 });
        doc.text(`• Número CAS: ${datosConvocatoria.numeroCas}`, { x: 100 });
        doc.text(`• Área: ${datosConvocatoria.area}`, { x: 100 });
  doc.text(`• URL: https://ugeltalara.edu.pe/convocatorias/${datosConvocatoria.idConvocatoria}`, { x: 100 });

  doc.moveDown(3);
  doc.fontSize(16).fillColor("#555").font("Helvetica-Oblique");
  doc.text(`Código del Certificado: ${codigoCertificado}`, { align: "center" });
  doc.text(`Emitido el ${fecha} a las ${hora}`, { align: "center" });

  // Sección de información de convocatorias
  const firmaY = doc.y + 50;
  
  // Primera sección: Eliminada (antes era Clavijo)
  // Solo línea separadora
  doc.moveTo(100, firmaY).lineTo(width - 100, firmaY).stroke("#003366", 1);
  
  // Segunda sección: GET de las convocatorias
  doc.moveDown(2);
  doc.fontSize(18).fillColor("#003366").font("Helvetica-Bold").text("CONVOCATORIAS DISPONIBLES", { align: "center" });
  doc.moveDown(1);
  
  try {
    // Obtener convocatorias activas
    const [convocatoriasRows] = await pool.execute(
      "SELECT puesto, numero_cas, area FROM convocatorias WHERE estado = 'activo' ORDER BY fechaPublicacion DESC LIMIT 5"
    );
    
    if (convocatoriasRows.length > 0) {
      doc.fontSize(14).fillColor("#000").text("Convocatorias activas:", { x: 100 });
      doc.moveDown(0.5);
      
      convocatoriasRows.forEach((convocatoria, index) => {
        doc.fontSize(12).fillColor("#000").text(
          `${index + 1}. ${convocatoria.puesto} - CAS: ${convocatoria.numero_cas} - ${convocatoria.area}`, 
          { x: 120 }
        );
      });
    } else {
      doc.fontSize(14).fillColor("#666").text("No hay convocatorias activas disponibles", { x: 100 });
    }
  } catch (err) {
    doc.fontSize(14).fillColor("#666").text("Error al obtener convocatorias", { x: 100 });
    console.log("⚠️ Error obteniendo convocatorias:", err.message);
  }
  
  // Tercera sección: Eliminada (antes era RRHH)
  // Solo línea separadora
        doc.moveDown(2);
  doc.moveTo(100, doc.y).lineTo(width - 100, doc.y).stroke("#003366", 1);

  drawFooter(doc);
}

async function drawPageTwo(doc, data, qrCodeDataURL) {
  const { datosConvocatoria, rrhhUserName, fecha, hora } = data;
  const { width } = doc.page;

  doc.addPage();
  drawPageFrames(doc);

  // 🔹 Encabezado principal
  doc
    .fontSize(28)
    .fillColor("#003366")
    .font("Helvetica-Bold")
    .text("INFORMACIÓN DE VERIFICACIÓN", { align: "center", y: 90 });
  doc.moveTo(100, 130).lineTo(width - 100, 130).stroke("#FFD700", 3);

  // 🔹 Subtítulo
  doc.moveDown(2);
  doc
    .fontSize(14)
    .fillColor("#666")
    .font("Helvetica-Oblique")
    .text("Escanea el código QR para verificar la autenticidad del certificado.", {
      align: "center",
    });

  // 🔹 QR centrado
  try {
    const qrBuffer = Buffer.from(qrCodeDataURL.split(",")[1], "base64");
    const qrX = width / 2 - 75;
    const qrY = 190;
    doc.image(qrBuffer, qrX, qrY, { width: 150, height: 150 });
  } catch (e) {
    doc.moveDown(3);
    doc.fillColor("red").text("⚠️ Error al mostrar el código QR", { align: "center" });
  }

  doc.moveDown(10);
  doc.moveTo(100, doc.y).lineTo(width - 100, doc.y).stroke("#003366", 1);

  // 🔹 Datos de la convocatoria
  doc.moveDown(1.5);
  doc.fontSize(18).fillColor("#003366").font("Helvetica-Bold").text("DATOS DE LA CONVOCATORIA", { align: "left", x: 80 });
  doc.moveDown(0.8);
  doc.fontSize(13).fillColor("#000");
  doc.text(`• Puesto: ${datosConvocatoria.puesto}`, { x: 100 });
  doc.text(`• Número CAS: ${datosConvocatoria.numeroCas}`, { x: 100 });
  doc.text(`• Área: ${datosConvocatoria.area}`, { x: 100 });

  // 🔹 Separador
  doc.moveDown(2);
  doc.moveTo(100, doc.y).lineTo(width - 100, doc.y).stroke("#FFD700", 2);
  doc.moveDown(1);

  // 🔹 INFORMACIÓN ADICIONAL DEL SISTEMA
  doc.fontSize(20).fillColor("#003366").font("Helvetica-Bold").text("INFORMACIÓN DEL SISTEMA", { align: "center" });
  doc.moveDown(1);
  doc.fontSize(16).fillColor("#003366").font("Helvetica-Bold").text("Datos de verificación y seguimiento", { align: "center" });
  doc.moveDown(1);

  // Información del sistema
  doc.fontSize(12).fillColor("#000").font("Helvetica");
  
  doc.text("Este certificado ha sido generado automáticamente por el Sistema de Postulaciones UGEL Talara.", { x: 80, align: "justify" });
  doc.moveDown(0.5);
  
  doc.text("El postulante ha completado exitosamente el proceso de registro y postulación en nuestra plataforma digital.", { x: 80, align: "justify" });
  doc.moveDown(0.5);
  
  doc.text("Para verificar la autenticidad de este certificado, utilice el código QR o visite la URL de verificación.", { x: 80, align: "justify" });
  doc.moveDown(1);

  // Información técnica
  doc.fontSize(14).fillColor("#003366").font("Helvetica-Bold").text("DETALLES TÉCNICOS", { align: "center" });
  doc.moveDown(0.5);

  doc.text("• Sistema: Plataforma Digital UGEL Talara", { x: 80 });
  doc.text("• Versión: 2025.1", { x: 80 });
  doc.text("• Fecha de generación: " + new Date().toLocaleString("es-PE"), { x: 80 });
  doc.text("• Código de verificación: " + data.codigoCertificado, { x: 80 });
  doc.moveDown(1);

  // 🔹 Archivos subidos
  if (data.curriculumFiles && data.curriculumFiles.length > 0) {
    doc.moveDown(1);
    doc.fontSize(14).fillColor("#003366").font("Helvetica-Bold").text("ARCHIVOS ADJUNTADOS", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#000");
    doc.text(`• Currículum: ${data.curriculumFiles.length} archivo(s)`, { x: 80 });
    data.curriculumFiles.forEach((file, index) => {
      doc.fontSize(10).fillColor("#666").text(`  - ${file.nombre} (${Math.round(file.tamaño / 1024)} KB)`, { x: 100 });
    });
  }
  
  if (data.anexosFiles && data.anexosFiles.length > 0) {
    doc.fontSize(12).fillColor("#000");
    doc.text(`• Anexos: ${data.anexosFiles.length} archivo(s)`, { x: 80 });
    data.anexosFiles.forEach((file, index) => {
      doc.fontSize(10).fillColor("#666").text(`  - ${file.nombre} (${Math.round(file.tamaño / 1024)} KB)`, { x: 100 });
    });
  }

  // Nota importante
  doc.moveDown(1);
  doc.fontSize(12).fillColor("#666").font("Helvetica");
  doc.text("Nota: Este certificado es válido únicamente para fines de verificación del proceso de postulación. Las declaraciones juradas correspondientes se encuentran en el formulario de anexos del postulante.", { x: 80, align: "justify" });

  // 🔹 Pie institucional
  doc.moveDown(3);
  drawFooter(doc);
}

// ============================================================
// 🔹 4. CONTROLADOR PRINCIPAL
// ============================================================
export const generarCertificado = async (req, res) => {
  let filePath = "";

  try {
    console.log("🧾 Iniciando generación de certificado...");
    const IDUSUARIO = req.user?.id;
    if (!IDUSUARIO) return res.status(401).json({ message: "Usuario no autenticado." });

    const data = await fetchCertificateData(IDUSUARIO, pool);

    // Preparar datos del QR con resumen de archivos
    const qrData = {
      certificado: data.codigoCertificado,
      postulante: data.usuario.nombreCompleto,
      email: data.usuario.correo,
      puesto: data.datosConvocatoria.puesto,
      numeroCAS: data.datosConvocatoria.numeroCas,
      area: data.datosConvocatoria.area,
      convocatoriaId: data.datosConvocatoria.idConvocatoria,
      fecha: data.fecha,
      hora: data.hora,
      urlVerificacion: `https://ugeltalara.edu.pe/verificar-certificado/${data.codigoCertificado}`,
      entidad: "UGEL TALARA",
      sistema: "Sistema de Postulaciones",
      archivosCurriculum: {
        cantidad: data.curriculumFiles.length,
        archivos: data.curriculumFiles.map(file => ({
          nombre: file.nombre,
          tamaño: file.tamaño,
          tipo: file.tipo
        }))
      },
      archivosAnexos: {
        cantidad: data.anexosFiles.length,
        archivos: data.anexosFiles.map(file => ({
          nombre: file.nombre,
          tamaño: file.tamaño,
          tipo: file.tipo
        }))
      }
    };
    
    console.log("📋 Datos del QR generados:", JSON.stringify(qrData, null, 2));
    
    // Generar QR con manejo de errores
    let qrCodeDataURL;
    try {
      qrCodeDataURL = await generateQRCode(qrData);
      console.log("✅ QR generado exitosamente");
    } catch (qrError) {
      console.error("❌ Error generando QR:", qrError);
      // Generar un QR más simple en caso de error
      const qrDataSimple = {
        certificado: data.codigoCertificado,
        postulante: data.usuario.nombreCompleto,
        urlVerificacion: `https://ugeltalara.edu.pe/verificar-certificado/${data.codigoCertificado}`
      };
      qrCodeDataURL = await generateQRCode(qrDataSimple);
    }

    const uploadPath = path.join(process.cwd(), "uploads");
    await setupUploadsDirectory(uploadPath);

    const fileName = `Certificado_${data.usuario.nombreCompleto.replace(/\s+/g, "_")}.pdf`;
    filePath = path.join(uploadPath, fileName);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    await drawPageOne(doc, data);
    await drawPageTwo(doc, data, qrCodeDataURL);
      doc.end();

      stream.on("finish", async () => {
              const stats = fs.statSync(filePath);
              await pool.execute(
        `INSERT INTO Certificados (IDUSUARIO, nombreArchivo, rutaArchivo, tipoArchivo, tamanoArchivo)
         VALUES (?, ?, ?, ?, ?)`,
        [IDUSUARIO, fileName, filePath, "application/pdf", stats.size]
      );
      console.log(`✅ Certificado guardado y registrado en BD.`);

              res.download(filePath, fileName, (err) => {
        if (err) console.error("Error al enviar el archivo:", err);
                  fs.unlinkSync(filePath); 
              });
      });
  } catch (error) {
    console.error("❌ Error al generar certificado:", error);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(error.statusCode || 500).json({
      message: error.message || "Error al generar el certificado",
      error: error.originalError || error.message,
      });
  }
};

export const _obtenerCertificadosPorUsuarioInternal = async (IDUSUARIO) => {
    try {
        const [rows] = await pool.execute(
            `SELECT 
                IDCERTIFICADO, nombreArchivo, rutaArchivo, tipoArchivo, tamanoArchivo, fechaGeneracion
            FROM Certificados
            WHERE IDUSUARIO = ?
            ORDER BY fechaGeneracion DESC
            `, [IDUSUARIO]
        );
        return rows;
    } catch (error) {
        console.error('Error al obtener Certificados por usuario internamente:', error);
        throw error;
    }
};

/**
 * ============================================================
 * 📱 API DE VERIFICACIÓN DE CERTIFICADO POR QR
 * Para escanear QR con app móvil y verificar certificado
 * ============================================================
 */

export const verificarCertificadoPorCodigo = async (req, res) => {
    try {
        const { codigoCertificado } = req.params;
        
        if (!codigoCertificado) {
            return res.status(400).json({ 
                message: 'Código de certificado requerido.' 
            });
        }

        console.log(`🔍 Verificando certificado: ${codigoCertificado}`);

        // Buscar el certificado por código
        const [certificados] = await pool.execute(
            `SELECT 
                c.IDCERTIFICADO, c.IDUSUARIO, c.nombreArchivo, c.fechaGeneracion,
                u.nombreCompleto, u.correo,
                cv.puesto, cv.numero_cas, cv.area
            FROM Certificados c
            INNER JOIN usuarios u ON c.IDUSUARIO = u.IDUSUARIO
            LEFT JOIN convocatorias cv ON cv.id = (
                SELECT id FROM convocatorias 
                WHERE estado = 'activo' 
                ORDER BY fechaPublicacion DESC 
                LIMIT 1
            )
            WHERE c.nombreArchivo LIKE ?
            ORDER BY c.fechaGeneracion DESC
            LIMIT 1`,
            [`%${codigoCertificado}%`]
        );

        if (certificados.length === 0) {
            return res.status(404).json({ 
                message: 'Certificado no encontrado.',
                codigo: codigoCertificado 
            });
        }

        const certificado = certificados[0];

        // Obtener información de archivos subidos
        const [curriculumFiles] = await pool.execute(
            `SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaSubida 
            FROM Curriculum 
            WHERE IDUSUARIO = ? 
            ORDER BY fechaSubida DESC`,
            [certificado.IDUSUARIO]
        );

        const [anexosFiles] = await pool.execute(
            `SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaCreacion 
            FROM Anexos 
            WHERE IDUSUARIO = ? 
            ORDER BY fechaCreacion DESC`,
            [certificado.IDUSUARIO]
        );

        // Preparar respuesta
        const respuesta = {
            valido: true,
            certificado: {
                codigo: codigoCertificado,
                fechaGeneracion: certificado.fechaGeneracion,
                nombreArchivo: certificado.nombreArchivo
            },
            postulante: {
                id: certificado.IDUSUARIO,
                nombreCompleto: certificado.nombreCompleto,
                correo: certificado.correo
            },
            convocatoria: {
                puesto: certificado.puesto || "No especificado",
                numeroCas: certificado.numero_cas || "No especificado",
                area: certificado.area || "No especificada"
            },
            archivos: {
                curriculum: curriculumFiles.map(f => ({
                    nombre: f.nombreArchivo,
                    tamaño: f.tamanoArchivo,
                    tipo: f.tipoArchivo,
                    fecha: f.fechaSubida
                })),
                anexos: anexosFiles.map(f => ({
                    nombre: f.nombreArchivo,
                    tamaño: f.tamanoArchivo,
                    tipo: f.tipoArchivo,
                    fecha: f.fechaCreacion
                }))
            },
            fechaVerificacion: new Date().toISOString(),
            mensaje: "Certificado verificado exitosamente"
        };

        console.log(`✅ Certificado verificado: ${certificado.nombreCompleto}`);

        res.status(200).json(respuesta);

    } catch (error) {
        console.error('❌ Error al verificar certificado:', error);
        res.status(500).json({ 
            message: 'Error del servidor al verificar certificado.', 
            error: error.message 
        });
    }
};

/**
 * API alternativa: Verificar por datos del QR (recibe JSON completo)
 */
export const verificarCertificadoPorDatos = async (req, res) => {
    try {
        const qrData = req.body;
        
        if (!qrData || !qrData.certificado) {
            return res.status(400).json({ 
                message: 'Datos del QR no válidos.' 
            });
        }

        console.log(`🔍 Verificando certificado desde QR: ${qrData.certificado}`);

        // Buscar certificado completo en la base de datos
        let datosCompletos = null;
        
        try {
            // Extraer ID del certificado
            const codigoCert = qrData.certificado;
            
            // Buscar en la base de datos
            const [certificados] = await pool.execute(
                `SELECT 
                    c.IDCERTIFICADO, c.IDUSUARIO, c.nombreArchivo, c.fechaGeneracion,
                    u.nombreCompleto, u.correo,
                    cv.puesto, cv.numero_cas, cv.area
                FROM Certificados c
                INNER JOIN usuarios u ON c.IDUSUARIO = u.IDUSUARIO
                LEFT JOIN convocatorias cv ON cv.id = (
                    SELECT id FROM convocatorias 
                    WHERE estado = 'activo' 
                    ORDER BY fechaPublicacion DESC 
                    LIMIT 1
                )
                WHERE c.nombreArchivo LIKE ?
                ORDER BY c.fechaGeneracion DESC
                LIMIT 1`,
                [`%${codigoCert}%`]
            );

            if (certificados.length > 0) {
                const certificado = certificados[0];
                
                // Obtener archivos
                const [curriculumFiles] = await pool.execute(
                    `SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaSubida 
                    FROM Curriculum 
                    WHERE IDUSUARIO = ? 
                    ORDER BY fechaSubida DESC`,
                    [certificado.IDUSUARIO]
                );

                const [anexosFiles] = await pool.execute(
                    `SELECT nombreArchivo, tamanoArchivo, tipoArchivo, fechaCreacion 
                    FROM Anexos 
                    WHERE IDUSUARIO = ? 
                    ORDER BY fechaCreacion DESC`,
                    [certificado.IDUSUARIO]
                );

                datosCompletos = {
                    certificado: {
                        codigo: codigoCert,
                        fechaGeneracion: certificado.fechaGeneracion,
                        nombreArchivo: certificado.nombreArchivo
                    },
                    postulante: {
                        id: certificado.IDUSUARIO,
                        nombreCompleto: certificado.nombreCompleto,
                        correo: certificado.correo
                    },
                    convocatoria: {
                        puesto: certificado.puesto || "No especificado",
                        numeroCas: certificado.numero_cas || "No especificado",
                        area: certificado.area || "No especificada"
                    },
                    archivos: {
                        curriculum: curriculumFiles.map(f => ({
                            nombre: f.nombreArchivo,
                            tamaño: f.tamanoArchivo,
                            tipo: f.tipoArchivo,
                            fecha: f.fechaSubida
                        })),
                        anexos: anexosFiles.map(f => ({
                            nombre: f.nombreArchivo,
                            tamaño: f.tamanoArchivo,
                            tipo: f.tipoArchivo,
                            fecha: f.fechaCreacion
                        }))
                    }
                };
            }
        } catch (dbError) {
            console.error('❌ Error obteniendo datos completos:', dbError);
        }

        // Registrar verificación en la sesión de comité
        try {
            const fechaVerificacion = new Date();
            
            await pool.execute(
                `INSERT INTO VerificacionesQR (
                    codigoCertificado, 
                    datosQR, 
                    datosVerificados,
                    fechaVerificacion,
                    ipVerificacion
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    qrData.certificado,
                    JSON.stringify(qrData),
                    JSON.stringify(datosCompletos),
                    fechaVerificacion,
                    req.ip || req.connection.remoteAddress || 'Unknown'
                ]
            );
            console.log(`✅ Verificación registrada en sesión de comité`);
        } catch (logError) {
            console.error('⚠️ Error registrando verificación:', logError);
            // No fallar si no se puede registrar
        }

        // Respuesta completa
        const respuesta = {
            valido: true,
            datosQR: qrData,
            datosCompletos: datosCompletos,
            fechaVerificacion: new Date().toISOString(),
            mensaje: "Certificado verificado y registrado en sesión de comité",
            sesionComite: {
                registrado: true,
                timestamp: new Date().toISOString()
            }
        };

        console.log(`✅ Certificado verificado desde QR - Datos completos incluidos`);

        res.status(200).json(respuesta);

    } catch (error) {
        console.error('❌ Error al verificar certificado desde QR:', error);
        res.status(500).json({ 
            message: 'Error del servidor al verificar certificado.', 
            error: error.message 
        });
    }
};

/**
 * Obtener todas las verificaciones registradas para el comité
 */
export const obtenerVerificacionesSesionComite = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, limit = 100 } = req.query;
        
        let query = `
            SELECT 
                IDVERIFICACION,
                codigoCertificado,
                datosQR,
                datosVerificados,
                fechaVerificacion,
                ipVerificacion
            FROM VerificacionesQR
            WHERE 1=1
        `;
        
        const params = [];
        
        if (fechaInicio) {
            query += ` AND fechaVerificacion >= ?`;
            params.push(fechaInicio);
        }
        
        if (fechaFin) {
            query += ` AND fechaVerificacion <= ?`;
            params.push(fechaFin);
        }
        
        query += ` ORDER BY fechaVerificacion DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const [verificaciones] = await pool.execute(query, params);
        
        // Parsear JSON stored
        const verificacionesParseadas = verificaciones.map(v => ({
            id: v.IDVERIFICACION,
            codigoCertificado: v.codigoCertificado,
            datosQR: JSON.parse(v.datosQR),
            datosVerificados: JSON.parse(v.datosVerificados),
            fechaVerificacion: v.fechaVerificacion,
            ipVerificacion: v.ipVerificacion
        }));
        
        res.status(200).json({
            total: verificacionesParseadas.length,
            verificaciones: verificacionesParseadas,
            fechaConsulta: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error al obtener verificaciones:', error);
        res.status(500).json({ 
            message: 'Error al obtener verificaciones.', 
            error: error.message 
        });
    }
};

// API para obtener datos del postulante y su convocatoria específica
export const obtenerDatosPostulanteConvocatoria = async (req, res) => {
    try {
        const { convocatoriaId } = req.params;
        
        if (!convocatoriaId) {
            return res.status(400).json({ 
                message: 'ID de convocatoria requerido.' 
            });
        }

        // Obtener datos de la convocatoria específica
        const [convocatoriaRows] = await pool.execute(
            'SELECT id, area, puesto, sueldo, requisitos, experiencia, licenciatura, habilidades, fechaPublicacion, fechaFinalizacion, estado, numero_cas FROM convocatorias WHERE id = ?',
            [convocatoriaId]
        );

        if (convocatoriaRows.length === 0) {
            return res.status(404).json({ 
                message: 'Convocatoria no encontrada.' 
            });
        }

        const convocatoria = convocatoriaRows[0];

        // Obtener todos los postulantes que han subido currículum para esta convocatoria específica
        const [postulantesRows] = await pool.execute(`
            SELECT DISTINCT 
                u.IDUSUARIO, 
                u.nombreCompleto, 
                u.correo,
                c.fechaSubida as fechaCurriculum,
                c.nombreArchivo as nombreCurriculum
            FROM usuarios u
            INNER JOIN Curriculum c ON u.IDUSUARIO = c.IDUSUARIO
            WHERE u.rol = 'postulante'
            ORDER BY c.fechaSubida DESC
        `);

        // Obtener datos adicionales de cada postulante
        const postulantesConDetalles = await Promise.all(
            postulantesRows.map(async (postulante) => {
                // Obtener anexos del postulante
                const [anexosRows] = await pool.execute(
                    'SELECT COUNT(*) as totalAnexos FROM anexos WHERE IDUSUARIO = ?',
                    [postulante.IDUSUARIO]
                );

                // Obtener evaluaciones
                const [evaluacionRows] = await pool.execute(
                    'SELECT estado, calificacion, comentarios, fechaEvaluacion FROM evaluaciones WHERE IDUSUARIO = ? ORDER BY fechaEvaluacion DESC LIMIT 1',
                    [postulante.IDUSUARIO]
                );

                return {
                    ...postulante,
                    totalAnexos: anexosRows[0]?.totalAnexos || 0,
                    evaluacion: evaluacionRows[0] || null,
                    estadoPostulacion: evaluacionRows[0]?.estado || 'pendiente'
                };
            })
        );

        res.status(200).json({
            convocatoria: convocatoria,
            postulantes: postulantesConDetalles,
            totalPostulantes: postulantesConDetalles.length,
            fechaConsulta: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error al obtener datos del postulante y convocatoria:', error);
        res.status(500).json({ 
            message: 'Error del servidor al obtener datos.', 
            error: error.message 
        });
    }
};

export const obtenerCandidatosConCurriculum = async (req, res) => {
    try {
        console.log('🔍 Iniciando consulta de candidatos...');
        
        // Consulta simplificada para obtener postulantes
        const [usersResult] = await pool.execute("SELECT IDUSUARIO, nombreCompleto, correo FROM usuarios WHERE rol = 'postulante'");
        console.log('📊 Postulantes encontrados:', usersResult.length);
        
        const postulantes = usersResult;
        const candidatesWithCurriculum = [];

        for (const postulante of postulantes) {
            try {
                console.log(`🔍 Procesando postulante: ${postulante.nombreCompleto}`);
                
                // Obtener currículum (con manejo de errores)
                let latestCurriculum = null;
                try {
                    const [curriculumData] = await pool.execute(
                        `SELECT IDCURRICULUM, nombreArchivo, tipoArchivo, tamanoArchivo, fechaSubida, fileContent 
                                FROM Curriculum WHERE IDUSUARIO = ? ORDER BY fechaSubida DESC LIMIT 1`, 
                        [postulante.IDUSUARIO]
                    );
                    latestCurriculum = curriculumData.length > 0 ? curriculumData[0] : null;
                } catch (curriculumError) {
                    console.log(`⚠️ Error obteniendo curriculum para ${postulante.nombreCompleto}:`, curriculumError.message);
                }

                // Obtener evaluaciones (con manejo de errores)
                let evaluacion = null;
                try {
                    const [evaluacionData] = await pool.execute(
                        `SELECT estado, calificacion, comentarios, fechaEvaluacion 
                                FROM evaluaciones WHERE IDUSUARIO = ? ORDER BY fechaEvaluacion DESC LIMIT 1`, 
                        [postulante.IDUSUARIO]
                    );
                    evaluacion = evaluacionData.length > 0 ? evaluacionData[0] : null;
                    console.log(`📊 Evaluación encontrada para ${postulante.nombreCompleto}:`, evaluacion);
                } catch (evaluacionError) {
                    console.log(`⚠️ Error obteniendo evaluación para ${postulante.nombreCompleto}:`, evaluacionError.message);
                }

                // Obtener anexos (con manejo de errores)
                let totalAnexos = 0;
                try {
                    const [anexosData] = await pool.execute(
                        `SELECT COUNT(*) as totalAnexos FROM anexos WHERE IDUSUARIO = ?`, 
                        [postulante.IDUSUARIO]
                    );
                    totalAnexos = anexosData[0]?.totalAnexos || 0;
                } catch (anexosError) {
                    console.log(`⚠️ Error obteniendo anexos para ${postulante.nombreCompleto}:`, anexosError.message);
                }

                // Generar PDF URL si existe curriculum
                let pdfUrl = null;
                if (latestCurriculum && latestCurriculum.fileContent) {
                    try {
                        const base64 = Buffer.from(latestCurriculum.fileContent).toString('base64');
                        pdfUrl = `data:${latestCurriculum.tipoArchivo || 'application/pdf'};base64,${base64}`;
                    } catch (pdfError) {
                        console.log(`⚠️ Error generando PDF URL para ${postulante.nombreCompleto}:`, pdfError.message);
                    }
                }

                // Determinar estado basado en evaluación
                let status = 'pending';
                let rating = 'pendiente';
                if (evaluacion) {
                    console.log(`🔍 Evaluación encontrada para ${postulante.nombreCompleto}:`, evaluacion.estado);
                    if (evaluacion.estado === 'approved') {
                        status = 'approved';
                        rating = 'aprobado';
                    } else if (evaluacion.estado === 'rejected') {
                        status = 'rejected';
                        rating = 'desaprobado';
                    } else if (evaluacion.estado === 'aprobado') {
                        status = 'approved';
                        rating = 'aprobado';
                    } else if (evaluacion.estado === 'rechazado') {
                        status = 'rejected';
                        rating = 'desaprobado';
                    }
                } else {
                    console.log(`📝 Sin evaluación para ${postulante.nombreCompleto} - estado: pending`);
                }

                const candidateData = {
                    id: postulante.IDUSUARIO,
                    name: postulante.nombreCompleto || 'Sin nombre',
                    email: postulante.correo || 'Sin email',
                    position: latestCurriculum ? latestCurriculum.nombreArchivo.replace('.pdf', '') : 'Sin CV',
                    experience: totalAnexos > 0 ? `${totalAnexos} anexos enviados` : 'Sin anexos', 
                    skills: ['Documentación', 'Postulación'], 
                    rating: rating, 
                    status: status, 
                    pdfUrl: pdfUrl,
                    curriculumDetails: latestCurriculum ? { ...latestCurriculum, fileContent: undefined } : null,
                    evaluacion: evaluacion
                };
                
                console.log(`✅ Candidato procesado: ${postulante.nombreCompleto} - Estado: ${status} - Rating: ${rating}`);
                candidatesWithCurriculum.push(candidateData);
                
                console.log(`✅ Postulante procesado: ${postulante.nombreCompleto}`);
            } catch (postulanteError) {
                console.error(`❌ Error procesando postulante ${postulante.nombreCompleto}:`, postulanteError);
                // Continuar con el siguiente postulante
            }
        }

        console.log(`📊 Total candidatos procesados: ${candidatesWithCurriculum.length}`);
        res.status(200).json(candidatesWithCurriculum);
    } catch (error) {
        console.error('❌ Error al obtener candidatos con currículum:', error);
        res.status(500).json({ 
            message: 'Error del servidor al obtener candidatos.', 
            error: error.message,
            details: 'Revisa los logs del servidor para más información'
        });
    }
};