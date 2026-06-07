import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../utils/jwt.js';

const MIN_PASSWORD_LEN = 8;

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

// Pre-computed bcrypt hash used purely to equalise login timing when the user is not found,
// preventing username enumeration via response-time differences.
const DUMMY_HASH = '$2b$12$eImiTAVSMoBDKhTar4GzouNE0bOKy6XiXV.hM93b.z0XcH5RrBWbq';

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Run bcrypt anyway so the response time is the same whether the email exists or not.
    await bcrypt.compare(password, DUMMY_HASH);
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

/**
 * Self-service password change. Requires the current password to be correct.
 */
export async function changePassword({ userId, currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
    const err = new Error(`New password must be at least ${MIN_PASSWORD_LEN} characters`);
    err.statusCode = 400;
    err.publicMessage = err.message;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    err.publicMessage = err.message;
    throw err;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hash } });
  return { ok: true };
}
