import PDFDocument from "pdfkit";
import fs from "fs";

export async function generarPDF(resultado) {
  const fileName = `reporte_${Date.now()}.pdf`;
  const path = `./reports/${fileName}`;
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(path));

  doc.fontSize(18).text("Reporte de Evaluación de Postulante", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(resultado, { align: "left" });

  doc.end();
  return path;
}
