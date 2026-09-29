import jwt from 'jsonwebtoken';
import { errorResponse } from '../http/response.js';

/**
 * Secreto de firma. Obligatorio en TODOS los entornos: un secreto de fallback
 * público en el repositorio permitiría a cualquiera forjar tokens válidos.
 *
 * Generar uno:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
if (!process.env.JWT_SECRET) {
  throw new Error(
    '[auth] JWT_SECRET no está definido. ' +
    'Copia .env.example a .env y genera uno con: ' +
    'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Genera un JWT firmado con los datos del estudiante autenticado.
 * @param {object} payload - Datos del estudiante a incluir en el token
 * @returns {string} Token JWT firmado
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Middleware de Autenticación JWT — SSU UMSS
 * Extrae y verifica el token del header "Authorization: Bearer <token>".
 * Si es válido, adjunta req.user con todos los campos del estudiante autenticado.
 * Si no hay token, se pasa sin req.user (ruta pública). Usar requireAuth para forzar auth.
 */
export const authenticateStudent = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // req.user contendrá: { id_estudiante, sis, nombre_completo, facultad, carrera, iat, exp }
    req.user = decoded;
    return next();
  } catch (err) {
    // Token expirado o inválido: pasar sin usuario (requireAuth rechazará si es necesario)
    req.user = null;
    return next();
  }
};

/**
 * Middleware que EXIGE autenticación válida.
 * Rechaza con 401 si no hay token o está expirado/inválido.
 */
export const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.id_estudiante) {
    return errorResponse(
      res,
      'No autorizado. Se requiere iniciar sesión. Incluya el header "Authorization: Bearer <token>" con un JWT válido.',
      401
    );
  }
  return next();
};
