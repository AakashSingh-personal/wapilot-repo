import { prisma } from '../lib/prisma.js';
import PDFDocument from 'pdfkit';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(d) {
  return d ? Number(d) : 0;
}

function workingDaysInPeriod(start, end) {
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── Payroll Config ───────────────────────────────────────────────────────────

export async function getPayrollConfig(businessId) {
  return prisma.payrollConfig.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
  });
}

export async function updatePayrollConfig(businessId, fields) {
  return prisma.payrollConfig.upsert({
    where: { businessId },
    create: { businessId, ...fields },
    update: fields,
  });
}

// ─── Staff Salary Config ──────────────────────────────────────────────────────

export async function listStaffPayrollConfigs(businessId) {
  return prisma.staffPayrollConfig.findMany({
    where: { businessId },
    include: { staff: { select: { id: true, name: true, staffCode: true } } },
    orderBy: { staff: { name: 'asc' } },
  });
}

export async function upsertStaffPayrollConfig(businessId, staffId, fields) {
  // Verify staff belongs to business
  const staff = await prisma.staffMember.findFirst({ where: { id: staffId, businessId } });
  if (!staff) { const e = new Error('Staff not found'); e.statusCode = 404; throw e; }

  return prisma.staffPayrollConfig.upsert({
    where: { staffId },
    create: { businessId, staffId, ...fields },
    update: fields,
  });
}

// ─── Generate Payroll ─────────────────────────────────────────────────────────

export async function generatePayrollRun(businessId, { periodStart, periodEnd, bonusMap = {} }) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Get business payroll config for overtime rate
  const bizConfig = await getPayrollConfig(businessId);
  const overtimeRatePerHour = toNum(bizConfig.overtimeRatePerHour);

  // Get all active staff with their payroll configs
  const staffList = await prisma.staffMember.findMany({
    where: { businessId, activeStatus: true },
    include: { payrollConfig: true },
  });

  // Create payroll run
  const run = await prisma.payrollRun.create({
    data: {
      businessId,
      periodStart: start,
      periodEnd: end,
      status: 'DRAFT',
      generatedAt: new Date(),
    },
  });

  const entries = [];

  for (const staff of staffList) {
    const cfg = staff.payrollConfig;
    const basicSalary = cfg ? toNum(cfg.basicSalary) : 0;
    const travelAllowance = cfg ? toNum(cfg.travelAllowance) : 0;
    const pfEnabled = cfg?.pfEnabled ?? false;
    const pfRate = cfg ? toNum(cfg.pfRate) : 12;
    const esiEnabled = cfg?.esiEnabled ?? false;
    const esiRate = cfg ? toNum(cfg.esiRate) : 0.75;
    const taxRate = cfg ? toNum(cfg.taxRate) : 0;
    const lateDeductionPerMinute = cfg ? toNum(cfg.lateDeductionPerMinute) : 0;
    const leaveDayDeductionRate = cfg ? toNum(cfg.leaveDayDeductionRate) : 1;

    // Aggregate attendance for the period
    const attendance = await prisma.attendanceRecord.findMany({
      where: {
        businessId,
        staffId: staff.id,
        date: { gte: start, lte: end },
      },
    });

    let presentDays = 0, absentDays = 0, halfDays = 0, leaveDays = 0;
    let lateMinutes = 0, overtimeMinutes = 0;

    const totalWorkingDays = workingDaysInPeriod(start, end);

    for (const rec of attendance) {
      if (rec.status === 'PRESENT') presentDays++;
      else if (rec.status === 'ABSENT') absentDays++;
      else if (rec.status === 'HALF_DAY') halfDays++;
      else if (rec.status === 'LEAVE') leaveDays++;
      lateMinutes += rec.lateMinutes ?? 0;
      overtimeMinutes += rec.overtimeMinutes ?? 0;
    }

    // Days not recorded are treated as absent
    const recordedDays = presentDays + absentDays + halfDays + leaveDays;
    if (recordedDays < totalWorkingDays) {
      absentDays += (totalWorkingDays - recordedDays);
    }

    // Commissions earned in this period (APPROVED or PAID)
    const commAgg = await prisma.commissionRecord.aggregate({
      where: {
        businessId,
        staffId: staff.id,
        status: { in: ['APPROVED', 'PAID'] },
        createdAt: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    const commission = toNum(commAgg._sum.amount);

    // Overtime pay
    const overtimeHours = overtimeMinutes / 60;
    const overtimePay = overtimeHours * overtimeRatePerHour;

    // Bonus from caller-supplied map (staffId → amount)
    const bonus = Number(bonusMap[staff.id] ?? 0);

    // Deductions
    const perDaySalary = basicSalary / (totalWorkingDays || 1);
    const leaveDeduction = (absentDays + halfDays * leaveDayDeductionRate) * perDaySalary;
    const lateDeductionAmt = lateMinutes * lateDeductionPerMinute;

    const grossEarnings = basicSalary + travelAllowance + overtimePay + commission + bonus;

    const pfAmt = pfEnabled ? ((basicSalary * pfRate) / 100) : 0;
    const esiAmt = esiEnabled ? ((grossEarnings * esiRate) / 100) : 0;
    const taxAmt = (grossEarnings * taxRate) / 100;
    const totalDeductions = leaveDeduction + lateDeductionAmt + pfAmt + esiAmt + taxAmt;
    const netPay = Math.max(0, grossEarnings - totalDeductions);

    entries.push({
      businessId,
      payrollRunId: run.id,
      staffId: staff.id,
      basicSalary,
      travelAllowance,
      overtime: overtimePay,
      commission,
      bonus,
      grossEarnings,
      leaveDeduction,
      lateDeduction: lateDeductionAmt,
      pf: pfAmt,
      esi: esiAmt,
      tax: taxAmt,
      totalDeductions,
      netPay,
      presentDays,
      absentDays,
      halfDays,
      leaveDays,
      lateMinutes,
      overtimeMinutes,
    });
  }

  await prisma.payrollEntry.createMany({ data: entries });

  return prisma.payrollRun.findUnique({
    where: { id: run.id },
    include: {
      entries: {
        include: { staff: { select: { id: true, name: true, staffCode: true } } },
      },
    },
  });
}

// ─── List / Get Runs ──────────────────────────────────────────────────────────

export async function listPayrollRuns(businessId, { page = 1, pageSize = 20 } = {}) {
  const skip = (page - 1) * pageSize;
  const [total, runs] = await Promise.all([
    prisma.payrollRun.count({ where: { businessId } }),
    prisma.payrollRun.findMany({
      where: { businessId },
      orderBy: { periodStart: 'desc' },
      skip,
      take: pageSize,
      include: { _count: { select: { entries: true } } },
    }),
  ]);
  return { total, page, pageSize, runs };
}

export async function getPayrollRun(businessId, runId) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, businessId },
    include: {
      entries: {
        include: { staff: { select: { id: true, name: true, staffCode: true, phone: true } } },
        orderBy: { staff: { name: 'asc' } },
      },
    },
  });
  if (!run) { const e = new Error('Payroll run not found'); e.statusCode = 404; throw e; }
  return run;
}

// ─── Finalize / Mark Paid ─────────────────────────────────────────────────────

export async function finalizePayrollRun(businessId, runId) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, businessId } });
  if (!run) { const e = new Error('Payroll run not found'); e.statusCode = 404; throw e; }
  if (run.status !== 'DRAFT') { const e = new Error('Only DRAFT runs can be finalized'); e.statusCode = 400; throw e; }
  return prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'FINALIZED', finalizedAt: new Date() },
  });
}

export async function markPayrollRunPaid(businessId, runId) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, businessId } });
  if (!run) { const e = new Error('Payroll run not found'); e.statusCode = 404; throw e; }
  if (run.status !== 'FINALIZED') { const e = new Error('Only FINALIZED runs can be marked as paid'); e.statusCode = 400; throw e; }
  return prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'PAID', paidAt: new Date() },
  });
}

// ─── Update Entry (manual bonus/adjustment) ───────────────────────────────────

export async function updatePayrollEntry(businessId, entryId, fields) {
  const entry = await prisma.payrollEntry.findFirst({ where: { id: entryId, businessId } });
  if (!entry) { const e = new Error('Entry not found'); e.statusCode = 404; throw e; }

  const run = await prisma.payrollRun.findUnique({ where: { id: entry.payrollRunId } });
  if (run.status !== 'DRAFT') { const e = new Error('Cannot edit entries in a non-DRAFT run'); e.statusCode = 400; throw e; }

  // Recompute totals if earnings/deductions changed
  const updated = { ...entry, ...fields };
  const gross = toNum(updated.basicSalary) + toNum(updated.travelAllowance) +
    toNum(updated.overtime) + toNum(updated.commission) + toNum(updated.bonus);
  const totalDed = toNum(updated.leaveDeduction) + toNum(updated.lateDeduction) +
    toNum(updated.pf) + toNum(updated.esi) + toNum(updated.tax);
  const net = Math.max(0, gross - totalDed);

  return prisma.payrollEntry.update({
    where: { id: entryId },
    data: { ...fields, grossEarnings: gross, totalDeductions: totalDed, netPay: net, updatedAt: new Date() },
  });
}

// ─── Salary Slip PDF ──────────────────────────────────────────────────────────

export async function generateSalarySlipPdf(businessId, runId, staffId) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, businessId },
  });
  if (!run) { const e = new Error('Payroll run not found'); e.statusCode = 404; throw e; }

  const entry = await prisma.payrollEntry.findFirst({
    where: { payrollRunId: runId, staffId, businessId },
    include: {
      staff: { select: { name: true, staffCode: true, phone: true, role: true } },
    },
  });
  if (!entry) { const e = new Error('Entry not found'); e.statusCode = 404; throw e; }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, phone: true },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = (n) => `₹${Number(n).toFixed(2)}`;
    const period = `${new Date(run.periodStart).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(business?.name ?? 'Business', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Salary Slip', { align: 'center' });
    doc.text(`Period: ${period}`, { align: 'center' });
    doc.moveDown();

    // Employee info
    doc.fontSize(10).font('Helvetica-Bold').text('Employee Details');
    doc.font('Helvetica');
    doc.text(`Name: ${entry.staff.name}`);
    doc.text(`Staff Code: ${entry.staff.staffCode ?? '-'}`);
    doc.text(`Designation: ${entry.staff.role ?? '-'}`);
    doc.text(`Phone: ${entry.staff.phone ?? '-'}`);
    doc.moveDown();

    // Attendance summary
    doc.font('Helvetica-Bold').text('Attendance Summary');
    doc.font('Helvetica');
    doc.text(`Present Days: ${entry.presentDays}  |  Absent Days: ${entry.absentDays}  |  Half Days: ${entry.halfDays}  |  Leave Days: ${entry.leaveDays}`);
    doc.text(`Late Minutes: ${entry.lateMinutes}  |  Overtime Minutes: ${entry.overtimeMinutes}`);
    doc.moveDown();

    // Earnings table
    const tableTop = doc.y;
    const col1 = 50, col2 = 300;
    const rowH = 20;
    let y = tableTop;

    doc.font('Helvetica-Bold');
    doc.text('Earnings', col1, y);
    doc.text('Deductions', col2, y);
    y += rowH;

    const earnings = [
      ['Basic Salary', fmt(entry.basicSalary)],
      ['Travel Allowance', fmt(entry.travelAllowance)],
      ['Overtime', fmt(entry.overtime)],
      ['Commission', fmt(entry.commission)],
      ['Bonus', fmt(entry.bonus)],
    ];
    const deductions = [
      ['Leave Deduction', fmt(entry.leaveDeduction)],
      ['Late Deduction', fmt(entry.lateDeduction)],
      ['PF', fmt(entry.pf)],
      ['ESI', fmt(entry.esi)],
      ['Tax (TDS)', fmt(entry.tax)],
    ];

    doc.font('Helvetica');
    const maxRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < maxRows; i++) {
      if (earnings[i]) doc.text(`${earnings[i][0]}: ${earnings[i][1]}`, col1, y);
      if (deductions[i]) doc.text(`${deductions[i][0]}: ${deductions[i][1]}`, col2, y);
      y += rowH;
    }

    doc.moveTo(col1, y).lineTo(550, y).stroke();
    y += 5;
    doc.font('Helvetica-Bold');
    doc.text(`Gross Earnings: ${fmt(entry.grossEarnings)}`, col1, y);
    doc.text(`Total Deductions: ${fmt(entry.totalDeductions)}`, col2, y);
    y += rowH + 10;

    doc.fontSize(13).text(`Net Pay: ${fmt(entry.netPay)}`, col1, y);

    doc.end();
  });
}

// ─── Bank Transfer Export (CSV) ───────────────────────────────────────────────

export async function exportBankTransferFile(businessId, runId) {
  const run = await getPayrollRun(businessId, runId);
  if (run.status !== 'FINALIZED' && run.status !== 'PAID') {
    const e = new Error('Run must be FINALIZED or PAID to export'); e.statusCode = 400; throw e;
  }

  const lines = [
    'StaffName,StaffCode,BankAccountNumber,IFSC,AccountName,Amount',
  ];

  for (const entry of run.entries) {
    const cfg = await prisma.staffPayrollConfig.findUnique({ where: { staffId: entry.staffId } });
    lines.push([
      entry.staff.name,
      entry.staff.staffCode ?? '',
      cfg?.bankAccountNumber ?? '',
      cfg?.bankIfsc ?? '',
      cfg?.bankAccountName ?? '',
      Number(entry.netPay).toFixed(2),
    ].join(','));
  }

  return lines.join('\n');
}

// ─── Payroll Summary ──────────────────────────────────────────────────────────

export async function getPayrollSummary(businessId, runId) {
  const run = await getPayrollRun(businessId, runId);
  const agg = await prisma.payrollEntry.aggregate({
    where: { payrollRunId: runId, businessId },
    _sum: {
      grossEarnings: true,
      totalDeductions: true,
      netPay: true,
      pf: true,
      esi: true,
      tax: true,
      commission: true,
      bonus: true,
    },
    _count: { id: true },
  });

  return {
    run: { id: run.id, status: run.status, periodStart: run.periodStart, periodEnd: run.periodEnd },
    headcount: agg._count.id,
    totalGross: toNum(agg._sum.grossEarnings),
    totalDeductions: toNum(agg._sum.totalDeductions),
    totalNetPay: toNum(agg._sum.netPay),
    totalPf: toNum(agg._sum.pf),
    totalEsi: toNum(agg._sum.esi),
    totalTax: toNum(agg._sum.tax),
    totalCommission: toNum(agg._sum.commission),
    totalBonus: toNum(agg._sum.bonus),
  };
}
