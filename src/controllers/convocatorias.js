import { pool } from '../database/conexion.js';
import path from 'path';
import fs from 'fs';

// Áreas permitidas
const areasPermitidas = [
  'Administración - Informática',
  'Administración - Tesorería',
  'Administración - Patrimonio',
  'Dirección - Mesa de Partes',
  'Dirección',
  'AGP',
  'Recursos Humanos',
  'Remuneraciones',
  'Escalafón',
  'UPDI',
  'Archivo',
];

// Crear una nueva convocatoria
const crearConvocatoria = async (req, res) => {
  console.log('Received body for crearConvocatoria:', req.body);
  const {
    area,
    puesto,
    sueldo,
    requisitos,
    experiencia,
    licenciatura,
    habilidades,
    fechaPublicacion,
    fechaFinalizacion,
    estado = 'activo',
    numero_cas,
  } = req.body;

  if (
    !area ||
    !puesto ||
    !sueldo ||
    !requisitos ||
    !experiencia ||
    !licenciatura ||
    !habilidades ||
    !fechaPublicacion ||
    !fechaFinalizacion ||
    !numero_cas
  ) {
    return res.status(400).json({
      message: 'Todos los campos son obligatorios.',
    });
  }

  if (!areasPermitidas.includes(area)) {
    return res.status(400).json({
      message: `El área "${area}" no es válida.`,
    });
  }

  const estadosPermitidos = ['activo', 'desactivado'];
  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({
      message: `El estado "${estado}" no es válido. Debe ser 'activo' o 'desactivado'.`,
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO convocatorias (
        area, puesto, sueldo, requisitos, experiencia, licenciatura,
        habilidades, fechaPublicacion, fechaFinalizacion, estado, numero_cas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        area,
        puesto,
        sueldo,
        requisitos,
        experiencia,
        licenciatura,
        habilidades,
        fechaPublicacion,
        fechaFinalizacion,
        estado,
        numero_cas,
      ]
    );

    const nuevaConvocatoria = {
      id: result.insertId,
      area,
      puesto,
      sueldo,
      requisitos,
      experiencia,
      licenciatura,
      habilidades,
      fechaPublicacion,
      fechaFinalizacion,
      estado,
      numero_cas,
    };

    res.status(201).json(nuevaConvocatoria);
  } catch (err) {
    console.error('SQL Error en crearConvocatoria:', err.message);
    res.status(500).json({
      message: 'Error interno del servidor al crear la convocatoria.',
      details: err.message,
    });
  }
};

// Obtener todas las convocatorias (con filtro opcional)
const obtenerConvocatorias = async (params) => {
  const { area, estado } = params.query;

  try {
    let query =
      'SELECT id, area, puesto, sueldo, requisitos, experiencia, licenciatura, habilidades, fechaPublicacion, fechaFinalizacion, estado, numero_cas FROM convocatorias WHERE 1=1';
    const queryParams = [];

    if (area) {
      query += ' AND area = ?';
      queryParams.push(area);
    }
    if (estado) {
      query += ' AND estado = ?';
      queryParams.push(estado);
    }

    const [rows] = await pool.execute(query, queryParams);
    return rows;
  } catch (err) {
    console.error('Error al obtener convocatorias:', err);
    throw err;
  }
};

// Controlador para API
const obtenerConvocatoriasController = async (req, res) => {
  try {
    const convocatorias = await obtenerConvocatorias({ query: req.query });
    res.status(200).json(convocatorias);
  } catch (err) {
    res.status(500).json({
      message: 'Error interno del servidor al obtener las convocatorias.',
      details: err.message,
    });
  }
};

// Obtener convocatoria por ID
const obtenerConvocatoriaPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT id, area, puesto, sueldo, requisitos, experiencia, licenciatura, habilidades, fechaPublicacion, fechaFinalizacion, estado, numero_cas FROM convocatorias WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Convocatoria no encontrada.',
      });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Error al obtener convocatoria por ID:', err);
    res.status(500).json({
      message: 'Error interno del servidor al obtener la convocatoria.',
    });
  }
};

// Actualizar convocatoria
const actualizarConvocatoria = async (req, res) => {
  const { id } = req.params;
  const {
    area,
    puesto,
    sueldo,
    requisitos,
    experiencia,
    licenciatura,
    habilidades,
    fechaPublicacion,
    fechaFinalizacion,
    estado,
    numero_cas,
  } = req.body;

  try {
    const [existingRows] = await pool.execute(
      'SELECT * FROM convocatorias WHERE id = ?',
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({
        message: 'Convocatoria no encontrada para actualizar.',
      });
    }

    const updateClauses = [];
    const updateValues = [];

    if (area !== undefined) {
      if (!areasPermitidas.includes(area)) {
        return res.status(400).json({
          message: `El área "${area}" no es válida.`,
        });
      }
      updateClauses.push('area = ?');
      updateValues.push(area);
    }
    if (puesto !== undefined) {
      updateClauses.push('puesto = ?');
      updateValues.push(puesto);
    }
    if (sueldo !== undefined) {
      updateClauses.push('sueldo = ?');
      updateValues.push(sueldo);
    }
    if (requisitos !== undefined) {
      updateClauses.push('requisitos = ?');
      updateValues.push(requisitos);
    }
    if (experiencia !== undefined) {
      updateClauses.push('experiencia = ?');
      updateValues.push(experiencia);
    }
    if (licenciatura !== undefined) {
      updateClauses.push('licenciatura = ?');
      updateValues.push(licenciatura);
    }
    if (habilidades !== undefined) {
      updateClauses.push('habilidades = ?');
      updateValues.push(habilidades);
    }
    if (fechaPublicacion !== undefined) {
      updateClauses.push('fechaPublicacion = ?');
      updateValues.push(fechaPublicacion);
    }
    if (fechaFinalizacion !== undefined) {
      updateClauses.push('fechaFinalizacion = ?');
      updateValues.push(fechaFinalizacion);
    }
    if (estado !== undefined) {
      const estadosPermitidos = ['activo', 'desactivado'];
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({
          message: `El estado "${estado}" no es válido.`,
        });
      }
      updateClauses.push('estado = ?');
      updateValues.push(estado);
    }
    if (numero_cas !== undefined) {
      updateClauses.push('numero_cas = ?');
      updateValues.push(numero_cas);
    }

    if (updateClauses.length === 0) {
      return res.status(400).json({
        message: 'No se proporcionaron campos para actualizar.',
      });
    }

    updateValues.push(id);
    const updateQuery = `UPDATE convocatorias SET ${updateClauses.join(
      ', '
    )} WHERE id = ?`;
    await pool.execute(updateQuery, updateValues);

    const [updated] = await pool.execute(
      'SELECT id, area, puesto, sueldo, requisitos, experiencia, licenciatura, habilidades, fechaPublicacion, fechaFinalizacion, estado, numero_cas FROM convocatorias WHERE id = ?',
      [id]
    );
    res.status(200).json(updated[0]);
  } catch (err) {
    console.error('Error al actualizar convocatoria:', err);
    res.status(500).json({
      message: 'Error interno del servidor al actualizar la convocatoria.',
      details: err.message,
    });
  }
};

// Eliminar convocatoria
const eliminarConvocatoria = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      'DELETE FROM convocatorias WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Convocatoria no encontrada para eliminar.',
      });
    }

    res.status(200).json({
      message: 'Convocatoria eliminada exitosamente.',
    });
  } catch (err) {
    console.error('Error al eliminar convocatoria:', err);
    res.status(500).json({
      message: 'Error interno del servidor al eliminar la convocatoria.',
    });
  }
};

// Descargar PDF
const downloadConvocatoriaPdf = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT pdf_path FROM convocatorias WHERE id = ?',
      [id]
    );

    if (rows.length === 0 || !rows[0].pdf_path) {
      return res.status(404).json({
        message: 'PDF de convocatoria no encontrado.',
      });
    }

    const filePath = rows[0].pdf_path;
    res.download(filePath, (err) => {
      if (err) {
        console.error('Error al descargar el PDF:', err);
        if (err.code === 'ENOENT') {
          return res
            .status(404)
            .json({ message: 'El archivo PDF no existe en el servidor.' });
        }
        res.status(500).json({
          message: 'Error interno del servidor al descargar el PDF.',
          details: err.message,
        });
      }
    });
  } catch (err) {
    console.error('Error en downloadConvocatoriaPdf:', err);
    res.status(500).json({
      message: 'Error interno del servidor al procesar la descarga del PDF.',
      details: err.message,
    });
  }
};

// Verificar si una convocatoria está deshabilitada
const verificarConvocatoriaDeshabilitada = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT id, estado, puesto, area, numero_cas, fechaPublicacion, fechaFinalizacion FROM convocatorias WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Convocatoria no encontrada.',
        isDeshabilitada: false,
      });
    }

    const convocatoria = rows[0];
    const isDeshabilitada = convocatoria.estado === 'desactivado';

    res.status(200).json({
      id,
      estado: convocatoria.estado,
      puesto: convocatoria.puesto,
      area: convocatoria.area,
      numero_cas: convocatoria.numero_cas,
      fechaPublicacion: convocatoria.fechaPublicacion,
      fechaFinalizacion: convocatoria.fechaFinalizacion,
      isDeshabilitada,
      message: isDeshabilitada
        ? 'La convocatoria ha sido deshabilitada. Los usuarios bloqueados pueden acceder nuevamente.'
        : 'La convocatoria sigue activa. Los usuarios permanecen bloqueados.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error al verificar convocatoria:', err);
    res.status(500).json({
      message: 'Error interno del servidor al verificar la convocatoria.',
      isDeshabilitada: false,
    });
  }
};

// Exportación final (✅ versión correcta)
export {
  crearConvocatoria,
  obtenerConvocatoriasController as obtenerConvocatorias,
  obtenerConvocatoriaPorId,
  actualizarConvocatoria,
  eliminarConvocatoria,
  downloadConvocatoriaPdf,
  verificarConvocatoriaDeshabilitada,
};
