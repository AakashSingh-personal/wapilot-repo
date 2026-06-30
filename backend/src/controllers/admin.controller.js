import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { mergeCatalog } from '../utils/businessCatalog.js';
import { signToken, verifyToken } from '../utils/jwt.js';
import { log } from '../utils/logger.js';
import { isEmailConfigured, sendEmail } from '../scheduling/notificationDelivery.service.js';

/** Cryptographically secure random password using rejection sampling to avoid modulo bias. */
function randomPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  // Largest multiple of alphabet.length that fits in a byte — values above this are discarded.
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

export async function ensureChiefAdmin(req, res, next) {
  try {
    const setupToken = process.env.CHIEF_ADMIN_SETUP_TOKEN;
    if (!setupToken) {
      return res.status(403).json({ error: 'Bootstrap endpoint is disabled — set CHIEF_ADMIN_SETUP_TOKEN to enable' });
    }
    const provided = String(req.body?.setupToken || req.headers['x-setup-token'] || '');
    // Use HMAC-based constant-time comparison so timing is equal regardless of input length.
    const key = crypto.randomBytes(32);
    const hmacProvided = crypto.createHmac('sha256', key).update(provided).digest();
    const hmacExpected = crypto.createHmac('sha256', key).update(setupToken).digest();
    if (!crypto.timingSafeEqual(hmacProvided, hmacExpected)) {
      return res.status(403).json({ error: 'Invalid setup token' });
    }

    const email = String(process.env.CHIEF_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.CHIEF_ADMIN_PASSWORD || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: 'CHIEF_ADMIN_EMAIL and CHIEF_ADMIN_PASSWORD must be set' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.json({ ok: true, userId: existing.id, email: existing.email, role: existing.role });
    }

    const hash = await bcrypt.hash(password, 12);
    const created = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { name: 'Vartalap HQ' } });
      const user = await tx.user.create({
        data: {
          email,
          password: hash,
          businessId: business.id,
          role: 'CHIEF_ADMIN',
        },
      });
      return { business, user };
    });

    res.status(201).json({ ok: true, userId: created.user.id, email: created.user.email, role: created.user.role });
  } catch (e) {
    next(e);
  }
}

export async function onboardClient(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const businessName = String(req.body?.businessName || '').trim();
    const ownerName = String(req.body?.ownerName || '').trim();

    if (!email || !businessName) {
      return res.status(400).json({ error: 'email and businessName are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const tempPassword = randomPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { name: businessName } });
      const user = await tx.user.create({
        data: {
          email,
          password: hash,
          businessId: business.id,
          role: 'OWNER',
        },
      });
      await tx.business.update({
        where: { id: business.id },
        data: { ownerId: user.id },
      });
      await tx.businessConfig.create({
        data: {
          businessId: business.id,
          services: mergeCatalog(null, {
            services: [{ name: 'Consultation', price: '₹500' }],
            ...(ownerName
              ? {
                  clientDetails: `Owner: ${ownerName}`,
                  clientProfile: { business_owner_name: ownerName },
                }
              : {}),
          }),
          workingHours: JSON.stringify({ slots: ['3 PM', '5 PM'] }),
          autoReplyEnabled: true,
        },
      });
      await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: 'BASIC',
          status: 'ACTIVE',
          amount: '0',
          expiresAt: null,
        },
      });
      return { business, user };
    });

    const token = signToken({
      userId: result.user.id,
      businessId: result.business.id,
      role: result.user.role,
      email: result.user.email,
    });

    const onboardPayload = {
      business: { id: result.business.id, name: result.business.name },
      owner: { id: result.user.id, email: result.user.email, role: result.user.role },
      token,
    };

    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: email,
          subject: 'Welcome to Vartalap — your account is ready',
          text: `Hello${ownerName ? ' ' + ownerName : ''},\n\nYour Vartalap account has been created.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n`,
        });
        return res.status(201).json({ ...onboardPayload, tempPasswordSentViaEmail: true });
      } catch (emailErr) {
        log('warn', 'onboard_email_failed', { email, message: emailErr.message });
      }
    }

    log('warn', 'onboard_temp_password_in_response', { email });
    res.status(201).json({ ...onboardPayload, tempPassword });
  } catch (e) {
    next(e);
  }
}

export async function listClients(req, res, next) {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: { select: { id: true, email: true, role: true } },
      },
    });
    const rows = businesses.map((b) => {
      const owner = (b.users || []).find((u) => u.role === 'OWNER') || null;
      return {
        id: b.id,
        name: b.name,
        ownerEmail: owner?.email || null,
        createdAt: b.createdAt,
      };
    });
    res.json({ rows });
  } catch (e) {
    next(e);
  }
}

export async function impersonateClient(req, res, next) {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    if (!businessId) return res.status(400).json({ error: 'businessId is required' });

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { users: true },
    });
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const owner = (business.users || []).find((u) => u.role === 'OWNER') || null;
    if (!owner) return res.status(404).json({ error: 'Owner not found for this business' });

    const token = signToken({
      userId: owner.id,
      businessId: business.id,
      role: owner.role,
      email: owner.email,
    });
    const returnToken = signToken(
      {
        userId: req.user.userId,
        businessId: req.user.businessId,
        role: req.user.role,
        email: req.user.email,
        type: 'chief_return',
      },
      '15m', // Short TTL — limits replay window if token is stolen from storage or logs.
    );

    res.json({
      token,
      returnToken,
      user: { id: owner.id, email: owner.email, role: owner.role, businessId: business.id },
      business: { id: business.id, name: business.name },
    });
  } catch (e) {
    next(e);
  }
}

export async function returnSession(req, res, next) {
  try {
    const raw = String(req.body?.returnToken || '').trim();
    if (!raw) return res.status(400).json({ error: 'returnToken is required' });

    let payload;
    try {
      payload = verifyToken(raw);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired return token' });
    }
    if (payload?.role !== 'CHIEF_ADMIN' || payload?.type !== 'chief_return') {
      return res.status(403).json({ error: 'Return token is not authorized for chief admin session' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.role !== 'CHIEF_ADMIN') {
      return res.status(404).json({ error: 'Chief admin user not found' });
    }
    const business = await prisma.business.findUnique({ where: { id: user.businessId } });

    const token = signToken({
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
      email: user.email,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, businessId: user.businessId },
      business: business ? { id: business.id, name: business.name } : null,
    });
  } catch (e) {
    next(e);
  }
}

export async function createChiefAdmin(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const inputPassword = String(req.body?.password || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const tempPassword = inputPassword || randomPassword(16);
    const hash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        businessId: req.user.businessId,
        role: 'CHIEF_ADMIN',
      },
    });

    const chiefPayload = { user: { id: user.id, email: user.email, role: user.role, businessId: user.businessId } };

    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: email,
          subject: 'Your Vartalap ChiefAdmin account',
          text: `Hello,\n\nA ChiefAdmin account has been created for you.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n`,
        });
        return res.status(201).json({ ...chiefPayload, tempPasswordSentViaEmail: true });
      } catch (emailErr) {
        log('warn', 'create_chief_admin_email_failed', { email, message: emailErr.message });
      }
    }

    log('warn', 'create_chief_admin_temp_in_response', { email });
    res.status(201).json({ ...chiefPayload, tempPassword });
  } catch (e) {
    next(e);
  }
}

