import { prisma } from '../lib/prisma.js';

/**
 * Recompute denormalized customer appointment stats from source tables.
 */
export async function refreshCustomerAppointmentStats(businessId, customerId) {
  if (!businessId || !customerId) return null;

  const [completed, upcoming, paymentSum, ratings] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, customerId, status: 'COMPLETED' },
      select: { startAt: true, staffId: true, serviceId: true },
      orderBy: { startAt: 'desc' },
    }),
    prisma.appointment.findFirst({
      where: {
        businessId,
        customerId,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        startAt: { gte: new Date() },
      },
      orderBy: { startAt: 'asc' },
      select: { startAt: true },
    }),
    prisma.appointmentPayment.aggregate({
      where: {
        businessId,
        status: 'PAID',
        appointment: { customerId },
      },
      _sum: { amount: true },
    }),
    prisma.appointmentRating.aggregate({
      where: { businessId, customerId },
      _avg: { rating: true },
    }),
  ]);

  const staffCounts = new Map();
  const serviceCounts = new Map();
  for (const row of completed) {
    staffCounts.set(row.staffId, (staffCounts.get(row.staffId) || 0) + 1);
    serviceCounts.set(row.serviceId, (serviceCounts.get(row.serviceId) || 0) + 1);
  }
  const favoriteStaffId = [...staffCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const favoriteServiceId = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const totalVisits = completed.length;
  const lastVisitAt = completed[0]?.startAt || null;
  const lifetimeSpend = Number(paymentSum._sum.amount || 0);
  const avgRating = ratings._avg.rating != null ? Number(ratings._avg.rating) : null;

  return prisma.customerAppointmentStats.upsert({
    where: { customerId },
    create: {
      businessId,
      customerId,
      totalVisits,
      lifetimeSpend,
      lastVisitAt,
      nextVisitAt: upcoming?.startAt || null,
      favoriteStaffId,
      favoriteServiceId,
      avgRating,
    },
    update: {
      totalVisits,
      lifetimeSpend,
      lastVisitAt,
      nextVisitAt: upcoming?.startAt || null,
      favoriteStaffId,
      favoriteServiceId,
      avgRating,
    },
  });
}

export async function getCustomerAppointmentStats(businessId, customerId) {
  let row = await prisma.customerAppointmentStats.findFirst({
    where: { businessId, customerId },
  });
  if (!row) {
    row = await refreshCustomerAppointmentStats(businessId, customerId);
  }
  return row;
}
