import { pool } from '../database/conexion.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { transporter } from '../mailer.js'; // Importar el transporter de mailer.js
import crypto from 'crypto'; // Importar crypto para generar tokens seguros
import multer from 'multer'; // Importar multer

const JWT_SECRET = process.env.JWT_SECRET;
const ROLES_PERMITIDOS = ['admin', 'comite', 'postulante', 'rr.hh', 'tramite'];

// Configuración de Multer para la subida de fotos de perfil (en memoria)
const storage = multer.memoryStorage(); // Almacenar el archivo en memoria como un Buffer

export const uploadProfile = multer({ 
    storage: storage, 
    limits: { fileSize: 2 * 1024 * 1024 }, // Límite de 2MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype); 
        if (mimetype) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)!')); 
    }
}).single('profilePicture'); 

// Funcion auxiliar para enviar correos
async function sendEmail(options) {
    const companyName = process.env.COMPANY_NAME || 'UGEL Talara';
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
    const expiresMinutes = options.expiresMinutes || 15;

    const resetHTMLTemplate = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${options.subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <!-- Preheader (texto que aparece en la bandeja de entrada) -->
  <div style="display:none; max-height:0px; overflow:hidden; color:#fff; line-height:1px; font-size:1px;">
    Si solicitaste restablecer tu contraseña, pulsa el botón para continuar. Enlace válido por ${expiresMinutes} minutos.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6f8; padding: 24px 0;">
    <tr>
      <td align="center">
        <!-- Contenedor principal -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding:24px; text-align:center; background: linear-gradient(90deg,#4A90E2,#3B82F6); color:#ffffff;">
              <h1 style="margin:0; font-size:20px; font-weight:600;">${companyName}</h1>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:28px;">
              <h2 style="margin:0 0 12px 0; font-size:18px; color:#111827;">${options.subject}</h2>
              <p style="margin:0 0 18px 0; color:#374151; font-size:15px; line-height:1.5;">
                Has solicitado restablecer tu contraseña. Haz clic en el botón de abajo para continuar con el proceso.
              </p>

              <!-- Botón CTA (usa href a la URL de restablecimiento) -->
              <div style="text-align:center; margin:26px 0;">
                <!-- Botón con fallback de texto y accesibilidad -->
                <a href="${options.resetURL}"
                   role="button"
                   aria-label="Restablecer contraseña"
                   style="background-color:#4A90E2; color:#ffffff; padding:14px 22px; text-decoration:none; border-radius:6px; display:inline-block; font-weight:600; font-size:15px;">
                  Restablecer Contraseña
                </a>
              </div>

              <p style="margin:0 0 10px 0; color:#6b7280; font-size:13px;">
                Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
              </p>
              <p style="word-break:break-all; font-size:13px; color:#2563eb; margin-top:6px;">
                <a href="${options.resetURL}" style="color:#2563eb; text-decoration:none;">${options.resetURL}</a>
              </p>

              <hr style="border:none; border-top:1px solid #eef2f7; margin:20px 0;">

              <p style="margin:0; color:#6b7280; font-size:12px;">
                Si no solicitaste esto, puedes ignorar este correo y tu contraseña permanecerá sin cambios. El enlace caduca en ${expiresMinutes} minutos.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px; background:#f9fafb; text-align:center; font-size:12px; color:#9ca3af;">
              <div style="margin-bottom:6px;">¿Necesitas ayuda? Escríbenos a <a href="mailto:${supportEmail}" style="color:#6b7280; text-decoration:none;">${supportEmail}</a></div>
              <div>${companyName} — &copy; <span id="year"></span></div>
            </td>
          </tr>
        </table>

        <!-- Nota legal en pequeño (fuera del contenedor blanco) -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; width:100%; margin-top:12px;">
          <tr>
            <td style="font-size:11px; color:#9ca3af; text-align:center;">
              Este correo fue enviado a la dirección asociada a tu cuenta. Si crees que esto es un error, ignóralo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Script para año en el pie (solo para clientes que permiten JS, la mayoría de clientes de correo lo ignoran; se incluye por si se renderiza en navegador) -->
  <script>document.getElementById('year')?.appendChild(document.createTextNode(new Date().getFullYear()));</script>
</body>
</html>`;

    const mailOptions = {
        from: `"Soporte UGEL Talara" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: resetHTMLTemplate,
    };
    await transporter.sendMail(mailOptions);
}

// Funcion auxiliar para buscar usuario por email
async function findUserByEmail(email) {
    const [rows] = await pool.execute("SELECT IDUSUARIO, correo, passwordResetToken, passwordResetExpires FROM USUARIOS WHERE correo = ?", [email]);
    return rows[0];
}

// Funcion auxiliar para actualizar el token de reseteo del usuario
async function updateUserResetToken(userId, token, expires) {
    await pool.execute(
        "UPDATE USUARIOS SET passwordResetToken = ?, passwordResetExpires = ? WHERE IDUSUARIO = ?",
        [token, new Date(expires), userId]
    );
}

// Funcion auxiliar para limpiar el token de reseteo del usuario
async function clearUserResetToken(userId) {
    await pool.execute(
        "UPDATE USUARIOS SET passwordResetToken = NULL, passwordResetExpires = NULL WHERE IDUSUARIO = ?",
        [userId]
    );
}

// Funcion auxiliar para buscar usuario por token de reseteo
async function findUserByResetToken(hashedToken) {
    const [rows] = await pool.execute(
        "SELECT IDUSUARIO, correo, contrasena, passwordResetToken, passwordResetExpires FROM USUARIOS WHERE passwordResetToken = ? AND passwordResetExpires > NOW()",
        [hashedToken]
    );
    const user = rows[0];
    // Añadir un método save simulado para la compatibilidad con el código proporcionado
    if (user) {
        user.save = async function() {
            await pool.execute(
                "UPDATE USUARIOS SET contrasena = ?, passwordResetToken = ?, passwordResetExpires = ? WHERE IDUSUARIO = ?",
                [this.contrasena, this.passwordResetToken, this.passwordResetExpires, this.IDUSUARIO]
            );
        };
    }
    return user;
}

export const registrarUsuario = async (req, res) => {
    try {
        const { nombreCompleto, correo, contrasena, rol } = req.body;
        if (!nombreCompleto || !correo || !contrasena || !rol) {
            return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        }
        if (!ROLES_PERMITIDOS.includes(rol)) {
            return res.status(400).json({ message: `Rol no válido.` });
        }
        
        const [usuarioExistente] = await pool.execute("SELECT * FROM USUARIOS WHERE correo = ?", [correo]);
        if (usuarioExistente.length > 0) {
            return res.status(409).json({ message: "El correo ya está registrado." });
        }

        const salt = await bcrypt.genSalt(10);
        const contrasenaHash = await bcrypt.hash(contrasena, salt);
        
        await pool.execute(
            "INSERT INTO USUARIOS (nombreCompleto, correo, contrasena, rol, estado) VALUES (?, ?, ?, ?, ?)",
            [nombreCompleto, correo, contrasenaHash, rol, 'ACTIVO']
        );

        res.status(201).json({ message: "Usuario registrado exitosamente" });
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        res.status(500).json({ message: "Error del servidor", error: error.message });
    }
};

export const loginUsuario = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        if (!correo || !contrasena) {
            return res.status(400).json({ message: 'Correo y contraseña son requeridos.' });
        }

        const [resultado] = await pool.execute("SELECT IDUSUARIO, nombreCompleto, correo, contrasena, rol, estado, fotoperfil, mimetype FROM USUARIOS WHERE correo = ?", [correo]);
        const usuario = resultado[0];

        if (!usuario) {
            return res.status(401).json({ message: "Credenciales incorrectas." });
        }

        if (usuario.estado === 'INACTIVO') {
            return res.status(401).json({ message: "Tu cuenta está inactiva. Contacta al administrador." });
        }
        
        console.log("Login - Provided Password (raw):", contrasena);
        console.log("Login - Stored Hashed Password:", usuario.contrasena);
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena); 
        if (!contrasenaValida) {
            return res.status(401).json({ message: "Credenciales incorrectas." });
        }
        
        const payload = { id: usuario.IDUSUARIO, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol, email: usuario.correo };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        // Convertir el buffer de la foto de perfil a Base64 para el frontend
        let profilePictureBase64 = null;
        if (usuario.fotoperfil instanceof Buffer) {
            const mimetype = usuario.mimetype || 'image/jpeg'; // Use stored mimetype, else default
            profilePictureBase64 = `data:${mimetype};base64,${usuario.fotoperfil.toString('base64')}`;
        }

        res.status(200).json({ message: "Inicio de sesión exitoso", token, user: { ...payload, profilePicture: profilePictureBase64 } });
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        res.status(500).json({ message: "Error del servidor", error: error.message });
    }
};

// Endpoint para verificar el rol del usuario
export const verificarRolUsuario = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "El correo es obligatorio." });
        }

        const [userRows] = await pool.execute(
            "SELECT IDUSUARIO, correo, rol, nombreCompleto FROM USUARIOS WHERE correo = ?", 
            [email]
        );
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ 
                message: 'No se encontró un usuario con este correo electrónico.' 
            });
        }

        res.status(200).json({
            email: user.correo,
            rol: user.rol,
            nombreCompleto: user.nombreCompleto
        });

    } catch (error) {
        console.error('Error en verificarRolUsuario:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const solicitarRecuperacion = async (req, res) => {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: "El correo es obligatorio." });

    try {
        // 1. Busca al usuario en la BD con su rol
        const [userRows] = await pool.execute(
            "SELECT IDUSUARIO, correo, rol, passwordResetToken, passwordResetExpires FROM USUARIOS WHERE correo = ?", 
            [email]
        );
        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ message: 'No se encontró un usuario con este correo electrónico.' });
        }

        // 2. VERIFICAR QUE EL ROL SEA POSTULANTE
        if (user.rol !== 'postulante') {
            return res.status(403).json({ 
                message: 'Solo los usuarios postulantes pueden recuperar su contraseña.' 
            });
        }

        // 3. Solo si es postulante, generar token y enviar correo
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // 4. Hashea el token y guárdalo en la BD con una fecha de expiración
        const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const passwordResetExpires = Date.now() + 15 * 60 * 1000; // Válido por 15 minutos

        // Guarda 'passwordResetToken' y 'passwordResetExpires' en el registro del usuario en tu DB.
        await updateUserResetToken(user.IDUSUARIO, passwordResetToken, passwordResetExpires);

        // 5. ⭐ CREA EL ENLACE APUNTANDO A TU FRONTEND ⭐
        // Este es el paso clave. La URL debe incluir el token (sin hashear).
        const resetURL = `http://localhost:5173/reset-password/${resetToken}`;

        // 6. Envía el correo con el enlace
        try {
            // El mensaje HTML ahora se genera directamente en sendEmail con el botón.
            await sendEmail({
                email: user.correo,
                subject: 'Enlace para restablecer tu contraseña',
                resetURL: resetURL, // Pasar la URL directamente a la función de envío de correo
                expiresMinutes: 15, // Pasar los minutos de expiración
            });

            res.status(200).json({ message: 'Correo de recuperación enviado exitosamente.' });

        } catch (error) {
            // Limpia el token si el envío falla
            await clearUserResetToken(user.IDUSUARIO);
            console.error('Error al enviar correo:', error);
            res.status(500).json({ message: 'Error al enviar el correo.' });
        }

    } catch (error) {
        console.error('Error en solicitarRecuperacion:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

export const restablecerContrasena = async (req, res) => {
    try {
        // 1. Hashea el token que viene de la URL para compararlo con el de la BD
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        // 2. Busca al usuario con ese token y que no haya expirado
        const user = await findUserByResetToken(hashedToken); // Tu función que busca en la BD

        // 3. Si no se encuentra el usuario, el token es inválido o expiró
        if (!user) {
            return res.status(400).json({ message: 'El token es inválido o ha expirado. Por favor, solicita uno nuevo.' });
        }

        // Obtén la nueva contraseña del cuerpo de la petición. Usa 'password' como en el ejemplo robusto.
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ message: 'La nueva contraseña es obligatoria.' });
        }

        // 4. Actualiza la contraseña
        const newPasswordHash = await bcrypt.hash(password, 10); // Usar `password` del body
        user.contrasena = newPasswordHash; // Asignar a la propiedad correcta
        
        // 5. Limpia los campos del token de la BD
        user.passwordResetToken = null; // Usar null para borrar
        user.passwordResetExpires = null; // Usar null para borrar
        await user.save(); // La función auxiliar ya tiene un save simulado

        // 6. Envía una respuesta de éxito
        res.status(200).json({ message: '¡Contraseña actualizada con éxito!' });

    } catch (error) {
        // Si algo falla, envía un error 500 claro
        console.error("ERROR EN RESET PASSWORD:", error);
        res.status(500).json({ message: 'Ocurrió un error en el servidor. Inténtalo de nuevo más tarde.' });
    }
};

// Función interna para obtener usuarios (sin req/res)
export const _obtenerUsuariosInternal = async ({ roles, IDUSUARIO }) => {
    try {
        let query = 'SELECT IDUSUARIO, nombreCompleto, correo, rol, fechaCreacion, estado, fotoperfil, mimetype FROM USUARIOS';
        let whereClauses = [];
        const queryParams = [];

        if (IDUSUARIO) {
            whereClauses.push("IDUSUARIO = ?");
            queryParams.push(IDUSUARIO);
        }

        if (roles) {
            const rolesArray = roles.split(',').map(role => role.trim());
            const validRoles = rolesArray.filter(role => ROLES_PERMITIDOS.includes(role));
            if (validRoles.length > 0) {
                const placeholders = validRoles.map(() => '?').join(', ');
                whereClauses.push(`rol IN (${placeholders})`);
                queryParams.push(...validRoles);
            } else {
                // If invalid roles are provided, return empty to prevent unauthorized access
                return [];
            }
        }

        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(' AND ');
        }
        
        const [rows] = await pool.execute(query, queryParams);
        return rows;
    } catch (error) {
        console.error("Error al obtener usuarios internamente:", error);
        throw error;
    }
};

export const obtenerUsuarios = async (req, res) => {
    try {
        const userRole = req.user.rol; // req.user es añadido por el middleware verifyToken
        const { roles } = req.query; // Obtener roles de los query params, ej. ?roles=rr.hh,comite
        const { IDUSUARIO } = req.params; // For potential /users/:IDUSUARIO route

        let users;
        if (userRole === 'admin') {
            users = await _obtenerUsuariosInternal({ roles, IDUSUARIO });
        } else {
            // Non-admin users can only see specific roles (postulante, comite, rr.hh) or their own data
            let internalRoles = (roles) ? roles.split(',').filter(r => ['comite', 'rr.hh', 'postulante'].includes(r.trim())).join(',') : 'comite,rr.hh,postulante';
            users = await _obtenerUsuariosInternal({ roles: internalRoles, IDUSUARIO });
        }

        const usersWithBase64Images = users.map(user => {
            if (user.fotoperfil instanceof Buffer) {
                const mimetype = user.mimetype || 'image/jpeg';
                user.fotoperfil = `data:${mimetype};base64,${user.fotoperfil.toString('base64')}`;
            }
            return user;
        });
        res.json(usersWithBase64Images);
    } catch (error) {
        console.error("Error al obtener usuarios:", error);
        res.status(500).json({ message: "Error del servidor", error: error.message });
    }
};

export const obtenerUsuarioID = async (req, res) => {
    try {
        const { IDUSUARIO } = req.params;

        const user = await _obtenerUsuariosInternal({ IDUSUARIO: IDUSUARIO });

        if (user.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }
        const userData = user[0];
        // Convertir el buffer de la foto de perfil a Base64 para el frontend
        if (userData.fotoperfil instanceof Buffer) {
            const mimetype = userData.mimetype || 'image/jpeg';
            userData.fotoperfil = `data:${mimetype};base64,${userData.fotoperfil.toString('base64')}`;
        }
        res.json(userData);
    } catch (error) {
        console.error("Error al obtener usuario por ID:", error);
        res.status(500).json({ message: "Error del servidor" });
    }
};

export const actualizarUsuario = async (req, res) => {
    try {
        const { IDUSUARIO } = req.params;
        const { nombreCompleto, correo, rol, contrasena, estado } = req.body;

        console.log("Actualizar Usuario - req.file:", req.file);
        console.log("Actualizar Usuario - req.body:", req.body);
        
        const profilePictureBuffer = req.file ? req.file.buffer : null; 
        console.log("Actualizar Usuario - profilePictureBuffer (exists):", !!profilePictureBuffer);

        // Verificar que el usuario que hace la petición sea el mismo que el IDUSUARIO a actualizar
        // O que el usuario tenga el rol de 'admin'
        if (req.user.rol !== 'admin' && req.user.id !== parseInt(IDUSUARIO)) {
            return res.status(403).json({ message: "No tienes permiso para actualizar este usuario." });
        }

        if (!nombreCompleto && !correo && !rol && !contrasena && !estado && !profilePictureBuffer) {
            return res.status(400).json({ message: 'No se proporcionaron datos para actualizar.' });
        }

        let fields = [];
        let queryParams = [];

        if (nombreCompleto) {
            fields.push('nombreCompleto = ?');
            queryParams.push(nombreCompleto);
        }
        if (correo) {
            fields.push('correo = ?');
            queryParams.push(correo);
        }
        if (rol) {
            if (!ROLES_PERMITIDOS.includes(rol)) {
                return res.status(400).json({ message: `Rol no válido.` });
            }
            fields.push('rol = ?');
            queryParams.push(rol);
        }
        if (estado) {
            if (estado !== 'ACTIVO' && estado !== 'INACTIVO') {
                return res.status(400).json({ message: "El estado proporcionado no es válido. Debe ser 'ACTIVO' o 'INACTIVO'." });
            }
            fields.push('estado = ?');
            queryParams.push(estado);
        }
        if (contrasena) {
            const salt = await bcrypt.genSalt(10);
            const contrasenaHash = await bcrypt.hash(contrasena, salt);
            fields.push('contrasena = ?');
            queryParams.push(contrasenaHash);
        }
        if (profilePictureBuffer) {
            fields.push('fotoperfil = ?');
            queryParams.push(profilePictureBuffer);
            fields.push('mimetype = ?'); // Add mimetype to update
            queryParams.push(req.file.mimetype);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: 'No se proporcionaron datos válidos para actualizar.' });
        }

        const query = `UPDATE USUARIOS SET ${fields.join(', ')} WHERE IDUSUARIO = ?`;
        queryParams.push(IDUSUARIO);
        
        console.log("Actualizar Usuario - SQL Query:", query);
        const [resultado] = await pool.execute(query, queryParams);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // Obtener el usuario actualizado para devolverlo en la respuesta
        const [updatedUserRows] = await pool.execute(
            "SELECT IDUSUARIO, nombreCompleto, correo, rol, estado, fechaCreacion, fotoperfil, mimetype FROM USUARIOS WHERE IDUSUARIO = ?",
            [IDUSUARIO]
        );

        if (updatedUserRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado después de la actualización.' });
        }

        const updatedUser = updatedUserRows[0];
        // Convertir el buffer de la foto de perfil a Base64 para el frontend
        if (updatedUser.fotoperfil instanceof Buffer) {
            const mimetype = updatedUser.mimetype || 'image/jpeg'; // Use stored mimetype, else default
            updatedUser.fotoperfil = `data:${mimetype};base64,${updatedUser.fotoperfil.toString('base64')}`;
        }

        res.status(200).json({ message: "Usuario actualizado exitosamente", user: updatedUser });

    } catch (error) {
        console.error("Error al actualizar usuario:", error); // Existing console.error
        // Enhanced logging for detailed error object
        if (error instanceof Error) {
            console.error("Detailed update error:", error.message, error.stack);
            // If using a specific DB driver, might have originalError property
            if (error.originalError) {
                console.error("Original DB error:", error.originalError);
            }
        }
        res.status(500).json({ message: "Error del servidor al intentar actualizar el usuario.", error: error.message });
    }
};

export const actualizarEstadoUsuario = async (req, res) => {
    try {
        const { IDUSUARIO } = req.params;
        const { estado } = req.body;

        if (isNaN(IDUSUARIO)) {
            return res.status(400).json({ message: "El ID del usuario debe ser un número." });
        }

        if (!estado || (estado !== 'ACTIVO' && estado !== 'INACTIVO')) {
            return res.status(400).json({ message: "El estado proporcionado no es válido. Debe ser 'ACTIVO' o 'INACTIVO'." });
        }

        const [resultado] = await pool.execute("UPDATE USUARIOS SET estado = ? WHERE IDUSUARIO = ?", [estado, IDUSUARIO]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        res.status(200).json({ message: "Estado de usuario actualizado exitosamente." });

    } catch (error) {
        console.error("Error al actualizar el estado del usuario:", error);
        res.status(500).json({ message: "Error del servidor al intentar actualizar el estado del usuario.", error: error.message });
    }
};

export const eliminarUsuario = async (req, res) => {
    try {
        const { IDUSUARIO } = req.params;
        if (isNaN(IDUSUARIO)) {
            return res.status(400).json({ message: "El ID del usuario debe ser un número." });
        }

        const [resultado] = await pool.execute("DELETE FROM USUARIOS WHERE IDUSUARIO = ?", [IDUSUARIO]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        res.status(200).json({ message: "Usuario eliminado exitosamente." });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ message: "Error del servidor al intentar eliminar el usuario.", error: error.message });
    }
};

export const obtenerNombreUsuarioPorId = async (idUsuario) => {
    try {
        const [resultado] = await pool.execute("SELECT nombreCompleto FROM USUARIOS WHERE IDUSUARIO = ?", [idUsuario]);
        return resultado[0] ? resultado[0].nombreCompleto : null;
    } catch (error) {
        console.error("Error al obtener nombre de usuario por ID:", error);
        throw error;
    }
};

export const obtenerConteoPostulantes = async (req, res) => {
    try {
        const { timeframe } = req.query; // Obtener el parámetro timeframe de la URL

        let dateFilter = '';
        let queryParams = [];
        if (timeframe === '7d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        } else if (timeframe === '30d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        } else if (timeframe === '90d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        }

        const [result] = await pool.execute(`SELECT COUNT(*) as totalPostulantes FROM USUARIOS WHERE rol = 'postulante' ${dateFilter}`, queryParams);
        const totalPostulantes = result[0].totalPostulantes;
        res.status(200).json({ totalPostulantes });
    } catch (error) {
        console.error("Error al obtener conteo de postulantes:", error);
        res.status(500).json({ message: "Error del servidor al obtener el conteo de postulantes.", error: error.message });
    }
};

// Función para obtener estadísticas generales (conteos)
export const obtenerEstadisticasGenerales = async (req, res) => {
    try {
        const { timeframe } = req.query; // Obtener el parámetro timeframe de la URL

        let dateFilter = '';
        let queryParams = [];
        if (timeframe === '7d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        } else if (timeframe === '30d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        } else if (timeframe === '90d') {
            dateFilter = 'AND fechaCreacion >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        }

        // Conteo de postulantes registrados (asumiendo rol 'postulante')
        const [resultPostulantes] = await pool.execute(`SELECT COUNT(*) as totalPostulantes FROM usuarios WHERE rol = 'postulante' ${dateFilter}`, queryParams);
        const totalPostulantes = resultPostulantes[0].totalPostulantes;

        // Conteo de CVs enviados (desde la tabla Curriculum)
        const [resultCVs] = await pool.execute("SELECT COUNT(*) as totalCVs FROM Curriculum");
        const totalCVs = resultCVs[0].totalCVs;

        // Conteo de anexos enviados (desde la tabla anexos)
        const [resultAnexos] = await pool.execute("SELECT COUNT(*) as totalAnexos FROM anexos");
        const totalAnexos = resultAnexos[0].totalAnexos;

        // Conteo de Convocatorias en estado 'Activo' (o el estado que signifique 'En Evaluación')
        const [resultConvocatoriasActivas] = await pool.execute("SELECT COUNT(*) as totalConvocatoriasActivas FROM convocatorias WHERE estado = 'activo'");
        const totalConvocatoriasActivas = resultConvocatoriasActivas[0].totalConvocatoriasActivas;

        res.status(200).json({
            totalPostulantes,
            totalCVs,
            totalAnexos,
            totalConvocatoriasActivas,
            // Puedes añadir más estadísticas aquí
        });

    } catch (error) {
        console.error('Error al obtener estadísticas generales:', error);
        res.status(500).json({ message: 'Error del servidor al obtener estadísticas.', error: error.message });
    }
};