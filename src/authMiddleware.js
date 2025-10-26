// RUTA: middleware/verifyToken.js
import jwt from 'jsonwebtoken';

/**
 * Verifica que el usuario tenga un token JWT válido
 */
export const verifyToken = (req, res, next) => {
  console.log("*** verifyToken: Iniciando ***");
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (!token) {
      console.log("*** verifyToken: No se encontró token. ***");
      return res.status(403).json({ message: 'Acceso denegado. Se requiere un token.' });
    }
    console.log("*** verifyToken: Token encontrado. ***");
    // Verifica el token con la clave secreta
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.log("*** verifyToken: Token inválido o expirado. ***");
        return res.status(401).json({ message: 'Token inválido o expirado.' });
      }

      // El payload del token debe incluir el ID del usuario y su rol
      // Ejemplo al firmar el token: jwt.sign({ id: user.id, rol: user.rol }, JWT_SECRET)
      req.user = decoded;
      console.log("*** verifyToken: Token válido, usuario decodificado:", req.user.id, req.user.rol);
      next();
    });
  } catch (error) {
    console.error('Error en verifyToken:', error);
    return res.status(500).json({ message: 'Error interno en la verificación del token.' });
  }
};

/**
 * Verifica que el usuario tenga uno de los roles permitidos
 */
export const checkRole = (rolesPermitidos = []) => {
  return (req, res, next) => {
    console.log("*** checkRole: Iniciando ***");
    try {
      console.log("*** checkRole: Usuario en req.user:", req.user ? req.user.id + " (" + req.user.rol + ")" : "No user");
      console.log("*** checkRole: Roles permitidos:", rolesPermitidos);
      if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
        console.log("*** checkRole: Acceso denegado por rol. ***");
        return res.status(403).json({ message: 'No tienes permiso para realizar esta acción.' });
      }
      console.log("*** checkRole: Rol permitido, continuando. ***");
      next();
    } catch (error) {
      console.error('Error en checkRole:', error);
      return res.status(500).json({ message: 'Error interno en la verificación de roles.' });
    }
  };
};
