import { prisma } from '../lib/prisma.js';

// ─── Rule resolution ──────────────────────────────────────────────────────────
//
// Priority (highest wins):
//   1. Staff + Service specific rule
//   2. Staff-only rule (any service)
//   3. Service-only rule (any staff)
//   4. Business-wide rule (staffId null, serviceId null)
//
async function resolveRule(businessId, staffId, serviceId) {
  const rules = await prisma.commissionRule.findMany({
    where: { businessId, isActive: true },
    orderBy: { priority: 'desc' },
  });

  const candidates = [
    rules.find(r => r.staffId === staffId && r.serviceId === serviceId),
    rules.find(r => r.staffId === staffId && r.serviceId === null),
    rules.find(r => r.staffId === null && r.serviceId === serviceId),
    rules.find(r => r.staffId === null && r.serviceId === null),
  ];

  return candidates.find(Boolean) ?? null;
}

// ─── Commission calculation ───────────────────────────────────────────────────

function calcFromRule(rule, appointmentAmount, completedCountThisMonth) {
  const val = Number(rule.value);
  const amount = Number(appointmentAmount);

  if (rule.type === 'PERCENTAGE') {
    return (amount * val) / 100;
  }
  if (rule.type === 'FIXED') {
    return val;
  }
  if (rule.type === 'TIER') {
    const slabs = Array.isArray(rule.tierSlabs) ? rule.tierSlabs : [];
    const slab = slabs
      .filter(s => completedCountThisMonth >= (s.from ?? 0))
      .sort((a, b) => b.from - a.from)[0];
    if (!slab) return 0;
    return (amount * (slab.rate ?? 0)) / 100;
  }
  if (rule.type === 'PRODUCT') {
    return val; // flat amount per product/service sold
  }
  if (rule.type === 'TEAM') {
    // TEAM rules store the manager's cut as a % of the amount
    return (amount * val) / 100;
  }
  return 0;
}

// Called after an appointment transitions to COMPLETED.
export async function calculateCommissionForAppointment(appointmentId, businessId) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { service: true },
  });
  if (!appt) return;

  // How many appointments has this staff completed this calendar month so far?
  const monthStart = new Date(appt.completedAt ?? new Date());
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const completedCountThisMonth = await prisma.appointment.count({
    where: {
      businessId,
      staffId: appt.staffId,
      status: 'COMPLETED',
      completedAt: { gte: monthStart },
    },
  });

  const rule = await resolveRule(businessId, appt.staffId, appt.serviceId);

  let staffAmount = 0;
  let ruleId = null;

  if (rule) {
    staffAmount = calcFromRule(rule, appt.amount, completedCountThisMonth);
    ruleId = rule.id;
  }

  // Upsert the staff commission record (idempotent — safe to re-run).
  if (staffAmount > 0 || rule) {
    await prisma.commissionRecord.upsert({
      where: { businessId_staffId_appointmentId: { businessId, staffId: appt.staffId, appointmentId } },
      create: { businessId, staffId: appt.staffId, appointmentId, ruleId, calculatedAmount: staffAmount },
      update: { ruleId, calculatedAmount: staffAmount },
    });
  }

  // TEAM rule: also create/update a record for the manager.
  if (rule?.type === 'TEAM' && rule.teamManagerId) {
    const managerRule = await resolveRule(businessId, rule.teamManagerId, appt.serviceId);
    const managerAmount = managerRule ? calcFromRule(managerRule, appt.amount, 0) : 0;
    if (managerAmount > 0) {
      await prisma.commissionRecord.upsert({
        where: { businessId_staffId_appointmentId: { businessId, staffId: rule.teamManagerId, appointmentId } },
        create: { businessId, staffId: rule.teamManagerId, appointmentId, ruleId: managerRule?.id ?? null, calculatedAmount: managerAmount, notes: 'Team commission' },
        update: { calculatedAmount: managerAmount },
      });
    }
  }
}

// ─── Rule CRUD ────────────────────────────────────────────────────────────────

export async function listCommissionRules(businessId) {
  return prisma.commissionRule.findMany({
    where: { businessId, isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function createCommissionRule({ businessId, staffId, serviceId, type, value, tierSlabs, teamManagerId, priority }) {
  return prisma.commissionRule.create({
    data: {
      businessId,
      staffId: staffId || null,
      serviceId: serviceId || null,
      type,
      value: value ?? 0,
      tierSlabs: tierSlabs ?? [],
      teamManagerId: teamManagerId || null,
      priority: priority ?? 0,
    },
  });
}

export async function updateCommissionRule({ businessId, ruleId, ...fields }) {
  const existing = await prisma.commissionRule.findFirst({ where: { id: ruleId, businessId } });
  if (!existing) { const e = new Error('Rule not found'); e.statusCode = 404; throw e; }
  return prisma.commissionRule.update({
    where: { id: ruleId },
    data: {
      staffId: 'staffId' in fields ? (fields.staffId || null) : existing.staffId,
      serviceId: 'serviceId' in fields ? (fields.serviceId || null) : existing.serviceId,
      type: fields.type ?? existing.type,
      value: fields.value ?? existing.value,
      tierSlabs: fields.tierSlabs ?? existing.tierSlabs,
      teamManagerId: 'teamManagerId' in fields ? (fields.teamManagerId || null) : existing.teamManagerId,
      priority: fields.priority ?? existing.priority,
      isActive: fields.isActive ?? existing.isActive,
    },
  });
}

export async function deleteCommissionRule({ businessId, ruleId }) {
  const existing = await prisma.commissionRule.findFirst({ where: { id: ruleId, businessId } });
  if (!existing) { const e = new Error('Rule not found'); e.statusCode = 404; throw e; }
  return prisma.commissionRule.update({ where: { id: ruleId }, data: { isActive: false } });
}

// ─── Commission records ───────────────────────────────────────────────────────

export async function listCommissionRecords({ businessId, staffId, status, from, to, page = 1, pageSize = 50 }) {
  const where = { businessId };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [total, records] = await Promise.all([
    prisma.commissionRecord.count({ where }),
    prisma.commissionRecord.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, designation: true } },
        appointment: { select: { id: true, appointmentNumber: true, startAt: true, amount: true, service: { select: { name: true } } } },
        rule: { select: { id: true, type: true, value: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, records };
}

export async function getCommissionSummary({ businessId, staffId, period = 'monthly' }) {
  const now = new Date();
  let from;
  if (period === 'daily') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'weekly') {
    const day = now.getDay();
    from = new Date(now);
    from.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const where = { businessId, createdAt: { gte: from } };
  if (staffId) where.staffId = staffId;

  const [pending, approved, paid] = await Promise.all([
    prisma.commissionRecord.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { calculatedAmount: true }, _count: true }),
    prisma.commissionRecord.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { calculatedAmount: true }, _count: true }),
    prisma.commissionRecord.aggregate({ where: { ...where, status: 'PAID' }, _sum: { calculatedAmount: true }, _count: true }),
  ]);

  return {
    period,
    from,
    pending: { amount: Number(pending._sum.calculatedAmount ?? 0), count: pending._count },
    approved: { amount: Number(approved._sum.calculatedAmount ?? 0), count: approved._count },
    paid: { amount: Number(paid._sum.calculatedAmount ?? 0), count: paid._count },
    total: {
      amount: Number(pending._sum.calculatedAmount ?? 0) + Number(approved._sum.calculatedAmount ?? 0) + Number(paid._sum.calculatedAmount ?? 0),
    },
  };
}

// Returns per-staff commission totals for a date range — used for dashboard charts.
export async function getCommissionLeaderboard({ businessId, from, to }) {
  const where = {
    businessId,
    createdAt: { gte: new Date(from), lte: new Date(to) },
  };
  const rows = await prisma.commissionRecord.groupBy({
    by: ['staffId'],
    where,
    _sum: { calculatedAmount: true },
    _count: true,
    orderBy: { _sum: { calculatedAmount: 'desc' } },
  });

  const staffIds = rows.map(r => r.staffId);
  const staffList = await prisma.staffMember.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true, designation: true, profilePicture: true },
  });
  const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));

  return rows.map(r => ({
    staff: staffMap[r.staffId] ?? { id: r.staffId, name: 'Unknown' },
    totalAmount: Number(r._sum.calculatedAmount ?? 0),
    appointmentCount: r._count,
  }));
}

export async function approveCommissions({ businessId, ids, approverId }) {
  if (!ids?.length) { const e = new Error('No ids provided'); e.statusCode = 400; throw e; }
  const result = await prisma.commissionRecord.updateMany({
    where: { id: { in: ids }, businessId, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: approverId, approvedAt: new Date() },
  });
  return { updated: result.count };
}

export async function markCommissionsPaid({ businessId, ids, paymentBatchId }) {
  if (!ids?.length) { const e = new Error('No ids provided'); e.statusCode = 400; throw e; }
  const batchId = paymentBatchId || `BATCH-${Date.now()}`;
  const result = await prisma.commissionRecord.updateMany({
    where: { id: { in: ids }, businessId, status: 'APPROVED' },
    data: { status: 'PAID', paymentBatchId: batchId, paidAt: new Date() },
  });
  return { updated: result.count, paymentBatchId: batchId };
}
