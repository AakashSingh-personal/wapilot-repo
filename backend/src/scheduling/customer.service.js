import { prisma } from '../lib/prisma.js';

export function normalizeCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

/**
 * Returns every plausible DB-stored variant of a phone number so that a
 * customer created through WhatsApp (stored as "+919876543210") is matched by
 * a public-booking submission of "9876543210" – and vice-versa.
 *
 * Variants generated for a 10-digit base "9876543210":
 *   "9876543210"      – 10-digit (public-booking / dashboard format)
 *   "+919876543210"   – WhatsApp webhook format  (+<country><number>)
 *   "919876543210"    – without the leading +
 *   "+9876543210"     – raw digits with + (edge case)
 */
export function phoneVariants(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  // Derive the 10-digit local number
  let base = digits;
  if (digits.length === 12 && digits.startsWith('91')) base = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('091')) base = digits.slice(3);

  const set = new Set([
    base,
    `91${base}`,
    `+91${base}`,
    `+${digits}`,
    digits,
  ]);
  return [...set].filter(Boolean);
}

export async function findOrCreateCustomer({ businessId, phone, name, email }) {
  const normalized = normalizeCustomerPhone(phone);
  if (normalized.length < 10) {
    const err = new Error('Valid 10-digit phone number required');
    err.statusCode = 400;
    throw err;
  }

  // Search all format variants so a customer created via WhatsApp ("+91XXXXXXXXXX")
  // is matched even when the public-booking form sends "XXXXXXXXXX".
  const existing = await prisma.customer.findFirst({
    where: {
      businessId,
      phone: { in: phoneVariants(phone) },
    },
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
