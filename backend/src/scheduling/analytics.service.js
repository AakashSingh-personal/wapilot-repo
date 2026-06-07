import { prisma } from '../lib/prisma.js';

export async function getSchedulingAnalytics(businessId, { days = 30 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [
    total,
    completed,
    cancelled,
    noShow,
    revenueAgg,
    appointments,
    ratingAgg,
    ratingCount,
    staffRows,
    sourceRows,
  ] = await Promise.all([
    prisma.appointment.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.appointment.count({ where: { businessId, status: 'COMPLETED', createdAt: { gte: since } } }),
    prisma.appointment.count({ where: { businessId, status: 'CANCELLED', createdAt: { gte: since } } }),
    prisma.appointment.count({ where: { businessId, status: 'NO_SHOW', createdAt: { gte: since } } }),
    prisma.appointment.aggregate({
      where: { businessId, status: 'COMPLETED', createdAt: { gte: since } },
      _sum: { amountPaid: true },
    }),
    prisma.appointment.findMany({
      where: { businessId, startAt: { gte: since } },
      select: { staffId: true, startAt: true, endAt: true, status: true, amountPaid: true },
    }),
    prisma.appointmentRating.aggregate({
      where: { businessId, createdAt: { gte: since } },
      _avg: { rating: true },
    }),
    prisma.appointmentRating.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.appointment.groupBy({
      by: ['staffId'],
      where: { businessId, status: 'COMPLETED', createdAt: { gte: since } },
      _count: { id: true },
      _sum: { amountPaid: true },
    }),
    prisma.appointment.groupBy({
      by: ['source'],
      where: { businessId, createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const staffIds = [...new Set(appointments.map((a) => a.staffId))];
  const staffHours = await prisma.staffWorkingHours.findMany({
    where: { businessId, staffId: { in: staffIds } },
  });
  const staffNames = await prisma.staffMember.findMany({
    where: { businessId, id: { in: staffIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(staffNames.map((s) => [s.id, s.name]));

  let bookedMinutes = 0;
  const availableMinutes = staffHours.length * 8 * 60;

  for (const a of appointments) {
    if (['COMPLETED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status)) {
      bookedMinutes += (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000;
    }
  }

  const utilization = availableMinutes > 0 ? (bookedMinutes / availableMinutes) * 100 : 0;
  const revenue = Number(revenueAgg._sum.amountPaid || 0);

  const staffBreakdown = staffRows
    .map((r) => ({
      staffId: r.staffId,
      staffName: nameMap[r.staffId] || 'Staff',
      completed: r._count.id,
      revenue: Number(r._sum.amountPaid || 0),
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10);

  const sourceBreakdown = sourceRows
    .map((r) => ({
      source: r.source || 'UNKNOWN',
      count: r._count.id,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalAppointments: total,
    completed,
    cancellationRate: total ? (cancelled / total) * 100 : 0,
    noShowRate: total ? (noShow / total) * 100 : 0,
    revenue,
    utilizationPercent: Math.round(utilization * 10) / 10,
    averageBookingValue: completed ? revenue / completed : 0,
    averageRating: ratingAgg._avg.rating != null ? Math.round(Number(ratingAgg._avg.rating) * 10) / 10 : null,
    ratingCount,
    staffBreakdown,
    sourceBreakdown,
  };
}

export async function getStaffTodaySchedule(businessId, staffId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return prisma.appointment.findMany({
    where: {
      businessId,
      staffId,
      startAt: { gte: start, lt: end },
      status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
    },
    orderBy: { startAt: 'asc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      service: true,
      location: true,
      payments: { where: { status: 'PAID' }, take: 3 },
    },
  });
}

export async function getSchedulingDashboardSummary(businessId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const endToday = new Date(start);
  endToday.setUTCDate(endToday.getUTCDate() + 1);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const now = new Date();

  const [todayCount, weekCount, upcoming] = await Promise.all([
    prisma.appointment.count({
      where: {
        businessId,
        startAt: { gte: start, lt: endToday },
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
      },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        startAt: { gte: start, lt: weekEnd },
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startAt: { gte: now },
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
      },
      orderBy: { startAt: 'asc' },
      take: 5,
      select: {
        id: true,
        startAt: true,
        status: true,
        appointmentNumber: true,
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { todayCount, weekCount, upcoming };
}

export async function getBusinessTodaySchedule(businessId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return prisma.appointment.findMany({
    where: {
      businessId,
      startAt: { gte: start, lt: end },
      status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
    },
    orderBy: [{ startAt: 'asc' }],
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });
}

export async function getStaffUpcomingSchedule(businessId, staffId, { days = 7 } = {}) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);

  return prisma.appointment.findMany({
    where: {
      businessId,
      staffId,
      startAt: { gte: now, lt: end },
      status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
    },
    orderBy: { startAt: 'asc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      service: true,
      location: true,
      payments: { where: { status: 'PAID' }, take: 3 },
    },
  });
}
