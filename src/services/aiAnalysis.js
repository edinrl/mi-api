import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analizarConvocatoriaYAnexos(datos) {
  const prompt = `
Analiza la siguiente información:
- Convocatoria: ${JSON.stringify(datos.convocatoria)}
- Documentos y anexos del postulante: ${JSON.stringify(datos.anexos)}

Compara los requisitos exigidos con los documentos presentados.

Genera un reporte estructurado así:
1️⃣ Requisitos cumplidos (detalla cuáles y evidencia).
2️⃣ Requisitos faltantes (detalla cuáles).
3️⃣ Observaciones del análisis.
4️⃣ Bonificaciones aplicables (según discapacidad, licenciado o deportista).
5️⃣ Nivel de cumplimiento general (Aprobado, Parcial o Rechazado).
6️⃣ Recomendación final para el comité.

Sé claro, objetivo y legal conforme a las normas establecidas.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0].message.content;
}

// Nueva función para analizar todos los anexos de un postulante
export async function analizarTodosLosAnexos(datosCompletos) {
  const { convocatoria, anexos, curriculum, postulante } = datosCompletos;
  
  // Preparar información detallada de los anexos
  const anexosDetallados = anexos.map(anexo => ({
    tipo: anexo.tipoAnexo,
    nombre: anexo.nombreArchivo,
    postulante: anexo.nombrePostulante,
    dni: anexo.dniPostulante,
    datosAdicionales: anexo.datosAdicionales ? JSON.parse(anexo.datosAdicionales) : null
  }));

  const prompt = `
Analiza COMPLETAMENTE la postulación del siguiente candidato:

📋 INFORMACIÓN DE LA CONVOCATORIA:
- Área: ${convocatoria.area}
- Puesto: ${convocatoria.puesto}
- Sueldo: ${convocatoria.sueldo}
- Requisitos: ${convocatoria.requisitos}
- Experiencia requerida: ${convocatoria.experiencia}
- Licenciatura requerida: ${convocatoria.licenciatura}
- Habilidades requeridas: ${convocatoria.habilidades}
- Número CAS: ${convocatoria.numero_cas}

👤 INFORMACIÓN DEL POSTULANTE:
- ID: ${postulante.id}
- Total de anexos presentados: ${postulante.totalAnexos}

📄 ANEXOS PRESENTADOS:
${anexosDetallados.map((anexo, index) => `
${index + 1}. ${anexo.tipo} - ${anexo.nombre}
   - Postulante: ${anexo.postulante}
   - DNI: ${anexo.dni}
   - Datos adicionales: ${anexo.datosAdicionales ? JSON.stringify(anexo.datosAdicionales) : 'No disponible'}
`).join('')}

📚 CURRÍCULUM VITAE:
${curriculum ? `- Archivo: ${curriculum.nombreArchivo} (${curriculum.tipoArchivo})` : 'No disponible'}

Realiza un análisis exhaustivo y genera un reporte estructurado con:

1️⃣ **EVALUACIÓN DE REQUISITOS:**
   - Requisitos cumplidos (con evidencia específica)
   - Requisitos faltantes o incompletos
   - Documentos adicionales presentados

2️⃣ **ANÁLISIS DE EXPERIENCIA:**
   - Evaluación de la experiencia presentada
   - Comparación con la experiencia requerida
   - Fortalezas y debilidades identificadas

3️⃣ **EVALUACIÓN ACADÉMICA:**
   - Verificación de títulos y certificaciones
   - Nivel académico vs requerido
   - Formación adicional relevante

4️⃣ **BONIFICACIONES APLICABLES:**
   - Discapacidad (si aplica)
   - Licenciatura (si aplica)
   - Deportista destacado (si aplica)
   - Otras bonificaciones identificadas

5️⃣ **OBSERVACIONES ESPECÍFICAS:**
   - Calidad de la documentación
   - Consistencia en la información
   - Aspectos destacables o preocupantes

6️⃣ **RECOMENDACIÓN FINAL:**
   - Nivel de cumplimiento: APROBADO / PARCIAL / RECHAZADO
   - Justificación de la decisión
   - Recomendaciones para el comité evaluador
   - Sugerencias de mejora para el postulante

Sé objetivo, detallado y conforme a las normas legales establecidas.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3, // Menor temperatura para mayor consistencia
  });

  return completion.choices[0].message.content;
}