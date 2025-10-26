import { obtenerDatosPostulante } from "../services/dbService.js";
import { analizarConvocatoriaYAnexos, analizarTodosLosAnexos } from "../services/aiAnalysis.js";
import { generarPDF } from "../services/pdfGenerator.js";
import { obtenerAnexosParaAnalisis } from "./documentos.js";

export const generarReporte = async (req, res) => {
  try {
    const { postulanteId, convocatoriaId } = req.body;

    // 1️⃣ Obtener datos completos de la base (incluyendo todos los anexos)
    const datosCompletos = await obtenerAnexosParaAnalisis(req, res);
    
    if (res.headersSent) return; // Si ya se envió respuesta de error

    // 2️⃣ Analizar con IA usando todos los anexos
    const resultado = await analizarTodosLosAnexos(datosCompletos);

    // 3️⃣ Generar reporte PDF
    const pdfPath = await generarPDF(resultado);

    res.status(201).json({
      success: true,
      mensaje: "Reporte generado con éxito",
      resultado,
      pdfPath,
      datosAnalizados: {
        totalAnexos: datosCompletos.anexos.length,
        postulante: datosCompletos.postulante,
        convocatoria: datosCompletos.convocatoria.area + ' - ' + datosCompletos.convocatoria.puesto
      }
    });
  } catch (err) {
    console.error("❌ Error al generar reporte:", err);
    res.status(500).json({ success: false, message: "Error al generar reporte" });
  }
};

export const descargarReporte = async (req, res) => {
  try {
    const path = `./reports/${req.params.id}.pdf`;
    res.download(path);
  } catch {
    res.status(404).json({ message: "Reporte no encontrado" });
  }
};
