import { verifyToken } from '../utils/jwt.js';

/**
 * Verify JWT from WebSocket auth frame. Same claims as HTTP authMiddleware.
 * @returns {{ userId: string, businessId: string, role: string, email: string }}
 */
export function verifySocketAuthToken(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Missing token');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const decoded = verifyToken(token);
  const userId = decoded.userId;
  const businessId = decoded.businessId;
  if (!userId || !businessId) {
    const err = new Error('Invalid token payload');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }
  return {
    userId: String(userId),
    businessId: String(businessId),
    role: String(decoded.role || ''),
    email: String(decoded.email || ''),
  };
}
