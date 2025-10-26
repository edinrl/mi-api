// src/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Crear pool de conexiones
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test",
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,        // Máximo de conexiones simultáneas
  queueLimit: 0,              // Sin límite de espera
  connectTimeout: 60000       // Timeout de conexión
});

// Función para verificar la conexión
export const verifyConnection = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conexión a la base de datos verificada');
    return true;
  } catch (error) {
    console.error('❌ Error verificando conexión a la base de datos:', error);
    return false;
  }
};

// Función para reintentar operaciones de DB
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

export default pool;
