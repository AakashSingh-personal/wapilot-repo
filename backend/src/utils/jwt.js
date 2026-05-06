import jwt from 'jsonwebtoken';

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, secret(), { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
