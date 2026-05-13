import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { mergeCatalog } from '../utils/businessCatalog.js';
import { signToken, verifyToken } from '../utils/jwt.js';

function randomPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function ensureChiefAdmin(req, res, next) {
  try {
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
      const business = await tx.business.create({ data: { name: 'WAPilot HQ' } });
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

    // Optionally return an immediate token for the created owner.
    const token = signToken({
      userId: result.user.id,
      businessId: result.business.id,
      role: result.user.role,
      email: result.user.email,
    });

    res.status(201).json({
      business: { id: result.business.id, name: result.business.name },
      owner: { id: result.user.id, email: result.user.email, role: result.user.role },
      tempPassword,
      token,
    });
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
      '12h',
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

    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, businessId: user.businessId },
      tempPassword,
    });
  } catch (e) {
    next(e);
  }
}

