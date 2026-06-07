import { verifyToken } from '../utils/jwt.js';

export function resolveAppointmentActionToken(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    const err = new Error('Invalid or expired link');
    err.statusCode = 401;
    throw err;
  }
  if (payload.type !== 'appointment_action' || !payload.appointmentId || !payload.businessId) {
    const err = new Error('Invalid token type');
    err.statusCode = 400;
    throw err;
  }
  return payload;
}
