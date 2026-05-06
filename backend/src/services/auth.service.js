import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../utils/jwt.js';

export async function register({ email, password, businessName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    err.publicMessage = err.message;
    throw err;
  }

  const hash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { name: businessName },
    });
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
        services: [{ name: 'Consultation', price: '₹500' }],
        workingHours: JSON.stringify({
          slots: ['3 PM', '5 PM'],
        }),
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
    return { user, business };
  });

  const token = signToken({
    userId: result.user.id,
    businessId: result.business.id,
    role: result.user.role,
    email: result.user.email,
  });

  return {
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      businessId: result.business.id,
    },
    business: { id: result.business.id, name: result.business.name },
  };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    err.publicMessage = err.message;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    err.publicMessage = err.message;
    throw err;
  }

  const token = signToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    email: user.email,
  });

  const business = await prisma.business.findUnique({ where: { id: user.businessId } });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    },
    business: business ? { id: business.id, name: business.name } : null,
  };
}
