import { prisma } from '../../../src/lib/prisma.js';
import { ensureSchedulingDefaults } from '../../../src/scheduling/appointment.service.js';
import { findAvailableSlots } from '../../../src/scheduling/slotEngine.service.js';

export async function createSchedulingTestTenant() {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const business = await prisma.business.create({
    data: { name: `Scheduling Test ${suffix}` },
  });
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      phone: `+9199${suffix.replace(/\D/g, '').slice(-8).padStart(8, '0')}`,
      name: 'Test Customer',
    },
  });
  const { location, staff, service } = await ensureSchedulingDefaults(business.id);
  return { business, customer, location, staff, service };
}

export async function destroySchedulingTestTenant(businessId) {
  await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
}

export async function pickBookableSlot({ businessId, serviceId, locationId, staffId, excludeStartAts = [] }) {
  const excludeSet = new Set(
    excludeStartAts.map((s) => new Date(s).toISOString()),
  );
  const start = new Date();
  start.setDate(start.getDate() + 14);
  for (let dayOffset = 0; dayOffset < 21; dayOffset += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + dayOffset);
    const date = d.toISOString().slice(0, 10);
    const slots = await findAvailableSlots({
      businessId,
      serviceId,
      locationId,
      staffId,
      date,
    });
    const available = slots.filter((s) => !excludeSet.has(new Date(s.startAt).toISOString()));
    if (available.length) return available[0];
  }
  throw new Error('No bookable slot found in the next 3 weeks');
}
