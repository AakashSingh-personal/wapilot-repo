import { prisma } from '../lib/prisma.js';

export async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { business: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
      },
      business: user.business ? { id: user.business.id, name: user.business.name } : null,
    });
  } catch (e) {
    next(e);
  }
}
