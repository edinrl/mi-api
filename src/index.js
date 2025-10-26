import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./database/conexion.js";
import { transporter } from "./mailer.js";

// Configuración de rutas absolutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga de variables de entorno (.env)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173", // para desarrollo local
      "https://tu-frontend-en-render.com" // ⚠️ cambia esto por tu dominio real de frontend
    ],
    credentials: true,
  })
);

// Carpeta pública
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Importación de rutas
import UgelTalaraRoutes from "./routes/UgelTalara.routes.js";
import convocatoriasRoutes from "./routes/convocatorias.routes.js";

// Uso de rutas
app.use("/ugel-talara", UgelTalaraRoutes);
app.use("/ugel-talara/convocatorias", convocatoriasRoutes);

// Ruta base
app.get("/", (req, res) => {
  res.send("🚀 API de UGEL Talara desplegada correctamente en Render");
});

// Puerto dinámico (Render asigna uno automáticamente)
const PORT = process.env.PORT || 9000;

// Inicio del servidor
app.listen(PORT, async () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);

  try {
    const connection = await pool.getConnection();
    console.log("🟢 Conectado correctamente a MySQL");
    connection.release();

    await transporter.verify();
    console.log("📧 Servicio de correo listo para enviar mensajes");
  } catch (err) {
    console.error("❌ Error al conectar a la base de datos o correo:", err);
  }
});

// Manejo de errores globales
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Promesa rechazada no manejada:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("⚠️ Excepción no capturada:", error);
});
