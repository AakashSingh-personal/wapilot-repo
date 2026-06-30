import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { isEmailConfigured, sendEmail } from '../scheduling/notificationDelivery.service.js';

/** Cryptographically secure random password using rejection sampling to avoid modulo bias. */
function randomPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  const out = [];
  while (out.length < len) {
    const buf = crypto.randomBytes(len * 2);
    for (const byte of buf) {
      if (byte < limit) {
        out.push(alphabet[byte % alphabet.length]);
        if (out.length === len) break;
      }
    }
  }
  return out.join('');
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

    const userPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      businessName: business.name,
    };

    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: email,
          subject: 'Your Vartalap account has been created',
          text: `Hello,\n\nAn account has been created for you on Vartalap.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n`,
        });
        return res.status(201).json({ user: userPayload, tempPasswordSentViaEmail: true });
      } catch (emailErr) {
        log('warn', 'create_user_email_failed', { email, message: emailErr.message });
        // Fall through to include password in response if email fails
      }
    }

    // SMTP not configured or email failed — include password in response.
    // Treat this response as sensitive; do not log it.
    log('warn', 'create_user_temp_password_in_response', { email, role });
    res.status(201).json({ user: userPayload, tempPassword });
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

    const resetPayload = {
      ok: true,
      user: { id: target.id, email: target.email, role: target.role },
      by: isChiefAdmin ? 'CHIEF_ADMIN' : 'OWNER',
    };

    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: target.email,
          subject: 'Your Vartalap password has been reset',
          text: `Hello,\n\nYour password has been reset.\n\nEmail: ${target.email}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n`,
        });
        return res.json({ ...resetPayload, tempPasswordSentViaEmail: true });
      } catch (emailErr) {
        log('warn', 'reset_password_email_failed', { email: target.email, message: emailErr.message });
      }
    }

    log('warn', 'reset_password_temp_in_response', { email: target.email, role: target.role });
    return res.json({ ...resetPayload, tempPassword });
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

