import { prisma } from '../lib/prisma.js';

export function normalizeCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

export async function findOrCreateCustomer({ businessId, phone, name, email }) {
  const normalized = normalizeCustomerPhone(phone);
  if (normalized.length < 10) {
    const err = new Error('Valid 10-digit phone number required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone: normalized } },
  });
  if (existing) {
    const updates = {};
    if (name && !existing.name) updates.name = name;
    if (email && !existing.email) updates.email = email;
    if (Object.keys(updates).length) {
      return prisma.customer.update({ where: { id: existing.id }, data: updates });
    }
    return existing;
  }

  return prisma.customer.create({
    data: { businessId, phone: normalized, name: name || null, email: email || null },
  });
}
