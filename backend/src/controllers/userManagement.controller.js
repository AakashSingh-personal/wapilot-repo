import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

function randomPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function listUsers(req, res, next) {
  try {
    const isChiefAdmin = req.user?.role === 'CHIEF_ADMIN';
    const where = isChiefAdmin
      ? {}
      : {
          businessId: req.user.businessId,
          role: { in: ['OWNER', 'STAFF'] },
        };

    const rows = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { business: { select: { id: true, name: true } } },
    });
    res.json({
      rows: rows.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        businessId: u.businessId,
        businessName: u.business?.name || null,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function listClients(_req, res, next) {
  try {
    const isChiefAdmin = _req.user?.role === 'CHIEF_ADMIN';
    const rows = isChiefAdmin
      ? await prisma.business.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true },
        })
      : await prisma.business.findMany({
          where: { id: _req.user.businessId },
          select: { id: true, name: true },
        });
    res.json({ rows });
  } catch (e) {
    next(e);
  }
}

export async function createUser(req, res, next) {
  try {
    const isChiefAdmin = req.user?.role === 'CHIEF_ADMIN';
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || '').trim().toUpperCase();
    const businessIdInput = String(req.body?.businessId || '').trim();
    const passwordInput = String(req.body?.password || '').trim();

    if (!email) return res.status(400).json({ error: 'email is required' });
    if (!['CHIEF_ADMIN', 'STAFF'].includes(role)) {
      return res.status(400).json({ error: 'role must be CHIEF_ADMIN or STAFF' });
    }
    if (!isChiefAdmin && role !== 'STAFF') {
      return res.status(403).json({ error: 'Only STAFF can be created in client scope' });
    }
    if (role === 'STAFF' && !businessIdInput && isChiefAdmin) {
      return res.status(400).json({ error: 'businessId is required for STAFF' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    let businessId = req.user.businessId;
    if (role === 'STAFF' && isChiefAdmin) businessId = businessIdInput;

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const tempPassword = passwordInput || randomPassword(16);
    const hash = await bcrypt.hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        role,
        businessId,
      },
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        businessName: business.name,
      },
      tempPassword,
    });
  } catch (e) {
    next(e);
  }
}

function canManageUsers(reqUser) {
  return reqUser?.role === 'CHIEF_ADMIN' || reqUser?.role === 'OWNER';
}

export async function resetUserPassword(req, res, next) {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Only ChiefAdmin or Owner can reset passwords' });
    }
    const { id } = req.params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isChiefAdmin = req.user.role === 'CHIEF_ADMIN';
    const isOwner = req.user.role === 'OWNER';
    if (isOwner && target.businessId !== req.user.businessId) {
      return res.status(403).json({ error: 'Owner can only manage users in own client' });
    }
    if (isOwner && target.role !== 'STAFF') {
      return res.status(403).json({ error: 'Owner can only reset STAFF users' });
    }

    const tempPassword = randomPassword(16);
    const hash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({
      where: { id: target.id },
      data: { password: hash },
    });
    return res.json({
      ok: true,
      user: { id: target.id, email: target.email, role: target.role },
      tempPassword,
      by: isChiefAdmin ? 'CHIEF_ADMIN' : 'OWNER',
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Only ChiefAdmin or Owner can delete users' });
    }
    const { id } = req.params;
    if (id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isChiefAdmin = req.user.role === 'CHIEF_ADMIN';
    const isOwner = req.user.role === 'OWNER';
    if (isOwner && target.businessId !== req.user.businessId) {
      return res.status(403).json({ error: 'Owner can only manage users in own client' });
    }
    if (isOwner && target.role !== 'STAFF') {
      return res.status(403).json({ error: 'Owner can only delete STAFF users' });
    }

    await prisma.user.delete({ where: { id: target.id } });
    return res.json({
      ok: true,
      user: { id: target.id, email: target.email, role: target.role },
      by: isChiefAdmin ? 'CHIEF_ADMIN' : 'OWNER',
    });
  } catch (e) {
    next(e);
  }
}

