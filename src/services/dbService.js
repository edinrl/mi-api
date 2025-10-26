import { pool } from "../database/conexion.js";

export async function obtenerDatosPostulante(postulanteId, convocatoriaId) {
  const [convocatoriaRows] = await pool.execute("SELECT * FROM convocatorias WHERE id = ?", [convocatoriaId]);
  const [anexosRows] = await pool.execute("SELECT * FROM Anexos WHERE IDUSUARIO = ?", [postulanteId]);

  return {
    convocatoria: convocatoriaRows[0],
    anexos: anexosRows,
  };
}
