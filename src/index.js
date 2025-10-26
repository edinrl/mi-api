import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from "./database/conexion.js"; // Import only pool
import { transporter } from './mailer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

app.use('/uploads', express.static('uploads'));

import UgelTalaraRoutes from './routes/UgelTalara.routes.js';
import convocatoriasRoutes from './routes/convocatorias.routes.js';
app.use('/ugel-talara', UgelTalaraRoutes);
app.use('/ugel-talara/convocatorias', convocatoriasRoutes);

app.get('/', (req, res) => {
    res.send('API de UGEL Talara');
});

const PORT = process.env.PORT || 9000;

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en el puerto ${PORT} 🔥`);

  try {
    const connection = await pool.getConnection(); // Use pool directly
    console.log("✅ Conectado correctamente a MySQL (XAMPP)");
    connection.release();
    transporter.verify().then(() => {
        console.log('Servicio de correo configurado y listo para enviar. 📧');
    }).catch(console.error);
  } catch (err) {
    console.error("Error al conectar a la base de datos:", err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('*** ERROR NO MANEJADO (Promesa Rechazada): ***', reason);
});

process.on('uncaughtException', (error) => {
    console.error('*** ERROR NO CAPTURADO (Excepción Síncrona): ***', error);
});