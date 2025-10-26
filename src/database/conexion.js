import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Función para verificar y reconectar la base de datos
export const verifyConnection = async () => {
  try {
    await pool.execute('SELECT 1');
    console.log('✅ Conexión a la base de datos verificada');
    return true;
  } catch (error) {
    console.error('❌ Error verificando conexión a la base de datos:', error);
    return false;
  }
};

// Función para reintentar operaciones de base de datos
export const retryDatabaseOperation = async (operation, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`❌ Intento ${attempt} falló:`, error);
      
      if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
        if (attempt < maxRetries) {
          console.log(`🔄 Reintentando en 2 segundos... (intento ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      throw error;
    }
  }
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  // Configuraciones para mejorar la estabilidad de la conexión
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Configuraciones adicionales para evitar ECONNRESET
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  // Configuraciones de timeout
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  // Reintentos automáticos
  retryDelay: 2000,
  maxReconnects: 3
});

export { pool };