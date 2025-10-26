-- Tabla para almacenar verificaciones de QR realizadas desde apps móviles
-- Esta tabla registra automáticamente cuando se escanea un QR

CREATE TABLE IF NOT EXISTS VerificacionesQR (
    IDVERIFICACION INT AUTO_INCREMENT PRIMARY KEY,
    codigoCertificado VARCHAR(50) NOT NULL,
    datosQR JSON NOT NULL COMMENT 'Datos originales del QR escaneado',
    datosVerificados JSON NOT NULL COMMENT 'Datos completos obtenidos de la base de datos',
    fechaVerificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ipVerificacion VARCHAR(50),
    INDEX idx_codigo (codigoCertificado),
    INDEX idx_fecha (fechaVerificacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notas:
-- - datosQR: Contiene el JSON completo escaneado del QR
-- - datosVerificados: Contiene todos los datos completos del postulante, archivos, etc.
-- - Esta tabla permite al comité ver un historial de todas las verificaciones realizadas
-- - Los datos se insertan automáticamente cuando se verifica un QR desde la API
