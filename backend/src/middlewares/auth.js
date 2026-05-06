import { verifyToken } from '../utils/jwt.js';
import { log } from '../utils/logger.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const decoded = verifyToken(token);
    req.user = {
      userId: decoded.userId,
      businessId: decoded.businessId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (e) {
    log('warn', 'jwt_invalid', { message: e.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner role required' });
  }
  next();
}
