import { prisma } from '../lib/prisma.js';

// ─── Shift Templates ─────────────────────────────────────────────────────────

export async function listShifts(businessId) {
  return prisma.shiftTemplate.findMany({
    where: { businessId, isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createShift({ businessId, name, type, startTime, endTime, splitStartTime2, splitEndTime2, breakMinutes, graceLateMinutes }) {
  return prisma.shiftTemplate.create({
    data: {
      businessId,
      name,
      type: type || 'FIXED',
      startTime,
      endTime,
      splitStartTime2: splitStartTime2 || null,
      splitEndTime2: splitEndTime2 || null,
      breakMinutes: breakMinutes || 0,
      graceLateMinutes: graceLateMinutes || 0,
    },
  });
}

export async function updateShift({ businessId, shiftId, ...fields }) {
  const existing = await prisma.shiftTemplate.findFirst({ where: { id: shiftId, businessId } });
  if (!existing) { const e = new Error('Shift not found'); e.statusCode = 404; throw e; }
  return prisma.shiftTemplate.update({
    where: { id: shiftId },
    data: {
      name: fields.name ?? existing.name,
      type: fields.type ?? existing.type,
      startTime: fields.startTime ?? existing.startTime,
      endTime: fields.endTime ?? existing.endTime,
      splitStartTime2: 'splitStartTime2' in fields ? (fields.splitStartTime2 || null) : existing.splitStartTime2,
      splitEndTime2: 'splitEndTime2' in fields ? (fields.splitEndTime2 || null) : existing.splitEndTime2,
      breakMinutes: fields.breakMinutes ?? existing.breakMinutes,
      graceLateMinutes: fields.graceLateMinutes ?? existing.graceLateMinutes,
      isActive: fields.isActive ?? existing.isActive,
    },
  });
}

export async function deleteShift({ businessId, shiftId }) {
  const existing = await prisma.shiftTemplate.findFirst({ where: { id: shiftId, businessId } });
  if (!existing) { const e = new Error('Shift not found'); e.statusCode = 404; throw e; }
  // Soft-delete: mark inactive
  return prisma.shiftTemplate.update({ where: { id: shiftId }, data: { isActive: false } });
}

// ─── Staff Shift Assignments ──────────────────────────────────────────────────

export async function assignShift({ businessId, staffId, shiftId, effectiveFrom, effectiveTo, rotationCycleDay }) {
  const staff = await prisma.staffMember.findFirst({ where: { id: staffId, businessId, deletedAt: null } });
  if (!staff) { const e = new Error('Staff not found'); e.statusCode = 404; throw e; }
  const shift = await prisma.shiftTemplate.findFirst({ where: { id: shiftId, businessId } });
  if (!shift) { const e = new Error('Shift not found'); e.statusCode = 404; throw e; }

  return prisma.staffShiftAssignment.create({
    data: {
      businessId,
      staffId,
      shiftId,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      rotationCycleDay: rotationCycleDay ?? null,
    },
    include: { shift: true },
  });
}

export async function listStaffShiftAssignments({ businessId, staffId }) {
  return prisma.staffShiftAssignment.findMany({
    where: { businessId, ...(staffId ? { staffId } : {}) },
    include: {
      shift: true,
      staff: { select: { id: true, name: true, designation: true } },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export async function deleteShiftAssignment({ businessId, assignmentId }) {
  const row = await prisma.staffShiftAssignment.findFirst({ where: { id: assignmentId, businessId } });
  if (!row) { const e = new Error('Assignment not found'); e.statusCode = 404; throw e; }
  return prisma.staffShiftAssignment.delete({ where: { id: assignmentId } });
}

// Returns the active ShiftTemplate for a staff member on a given date, or null.
export async function getStaffShiftForDate(staffId, date) {
  const d = new Date(date);
  const row = await prisma.staffShiftAssignment.findFirst({
    where: {
      staffId,
      effectiveFrom: { lte: d },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: d } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { shift: true },
  });
  return row?.shift ?? null;
}

// ─── Attendance Reports ───────────────────────────────────────────────────────

// Parses "HH:MM" into minutes-from-midnight.
function toMins(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isLate(checkInTime, shiftStartTime, graceMins) {
  if (!checkInTime || !shiftStartTime) return false;
  const checkInMins = checkInTime.getHours() * 60 + checkInTime.getMinutes();
  return checkInMins > toMins(shiftStartTime) + (graceMins || 0);
}

function isEarlyDeparture(checkOutTime, shiftEndTime) {
  if (!checkOutTime || !shiftEndTime) return false;
  const checkOutMins = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
  return checkOutMins < toMins(shiftEndTime);
}

export async function getDailyAttendanceReport({ businessId, date, locationId }) {
  const d = new Date(date);
  const where = { businessId, date: d, ...(locationId ? { locationId } : {}) };

  const [records, totalStaff] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      include: {
        staff: {
          select: { id: true, name: true, designation: true, profilePicture: true },
          include: { shiftAssignments: { where: { effectiveFrom: { lte: d }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: d } }] }, include: { shift: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
        },
        location: { select: { id: true, name: true } },
      },
      orderBy: { checkInTime: 'asc' },
    }),
    prisma.staffMember.count({ where: { businessId, activeStatus: 'ACTIVE', deletedAt: null } }),
  ]);

  return records.map(r => {
    const shift = r.staff?.shiftAssignments?.[0]?.shift ?? null;
    return {
      ...r,
      shiftName: shift?.name ?? null,
      isLate: isLate(r.checkInTime, shift?.startTime, shift?.graceLateMinutes),
      isEarlyDeparture: isEarlyDeparture(r.checkOutTime, shift?.endTime),
      overtimeMinutes: r.workingMinutes && shift
        ? Math.max(0, r.workingMinutes - (toMins(shift.endTime) - toMins(shift.startTime) - shift.breakMinutes))
        : 0,
    };
  });
}

export async function getMonthlyAttendanceReport({ businessId, year, month, staffId }) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0); // last day of month

  const [records, staffList] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        businessId,
        date: { gte: from, lte: to },
        ...(staffId ? { staffId } : {}),
      },
      select: { staffId: true, date: true, status: true, workingMinutes: true, checkInTime: true, outsideRadius: true },
      orderBy: { date: 'asc' },
    }),
    prisma.staffMember.findMany({
      where: { businessId, ...(staffId ? { id: staffId } : {}), activeStatus: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true, designation: true },
    }),
  ]);

  // Build a map: staffId → { date → record }
  const byStaff = {};
  for (const r of records) {
    if (!byStaff[r.staffId]) byStaff[r.staffId] = {};
    const key = new Date(r.date).toISOString().slice(0, 10);
    byStaff[r.staffId][key] = r;
  }

  const daysInMonth = to.getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return d.toISOString().slice(0, 10);
  });

  return staffList.map(s => {
    const staffRecords = byStaff[s.id] || {};
    const summary = { present: 0, absent: 0, halfDay: 0, leave: 0, holiday: 0, wfh: 0, fieldDuty: 0, totalWorkingMinutes: 0 };
    const grid = days.map(day => {
      const rec = staffRecords[day];
      if (rec) {
        if (rec.status === 'PRESENT') summary.present++;
        else if (rec.status === 'HALF_DAY') summary.halfDay++;
        else if (rec.status === 'LEAVE') summary.leave++;
        else if (rec.status === 'HOLIDAY') summary.holiday++;
        else if (rec.status === 'WFH') summary.wfh++;
        else if (rec.status === 'FIELD_DUTY') summary.fieldDuty++;
        summary.totalWorkingMinutes += rec.workingMinutes || 0;
      } else {
        summary.absent++;
      }
      return { date: day, status: rec?.status ?? 'ABSENT', workingMinutes: rec?.workingMinutes ?? null };
    });
    return { staff: s, summary, grid };
  });
}

export async function getLateArrivalReport({ businessId, from, to }) {
  const records = await prisma.attendanceRecord.findMany({
    where: { businessId, date: { gte: new Date(from), lte: new Date(to) } },
    include: {
      staff: {
        select: { id: true, name: true, designation: true },
        include: {
          shiftAssignments: {
            where: { effectiveFrom: { lte: new Date(to) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(from) } }] },
            include: { shift: true },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  return records
    .filter(r => {
      const shift = r.staff?.shiftAssignments?.[0]?.shift;
      return isLate(r.checkInTime, shift?.startTime, shift?.graceLateMinutes);
    })
    .map(r => {
      const shift = r.staff?.shiftAssignments?.[0]?.shift;
      const shiftStartMins = toMins(shift?.startTime);
      const checkInMins = r.checkInTime ? r.checkInTime.getHours() * 60 + r.checkInTime.getMinutes() : null;
      return {
        staffId: r.staffId,
        staffName: r.staff?.name,
        date: new Date(r.date).toISOString().slice(0, 10),
        checkInTime: r.checkInTime,
        shiftStartTime: shift?.startTime,
        lateByMinutes: checkInMins != null && shiftStartMins != null ? checkInMins - shiftStartMins - (shift?.graceLateMinutes || 0) : null,
      };
    });
}

export async function getOvertimeReport({ businessId, from, to }) {
  const records = await prisma.attendanceRecord.findMany({
    where: { businessId, date: { gte: new Date(from), lte: new Date(to) }, workingMinutes: { not: null } },
    include: {
      staff: {
        select: { id: true, name: true, designation: true },
        include: {
          shiftAssignments: {
            where: { effectiveFrom: { lte: new Date(to) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(from) } }] },
            include: { shift: true },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  return records
    .map(r => {
      const shift = r.staff?.shiftAssignments?.[0]?.shift;
      const shiftMins = shift ? toMins(shift.endTime) - toMins(shift.startTime) - (shift.breakMinutes || 0) : null;
      const overtime = shiftMins != null ? Math.max(0, (r.workingMinutes || 0) - shiftMins) : 0;
      return { ...r, shiftMins, overtimeMinutes: overtime };
    })
    .filter(r => r.overtimeMinutes > 0);
}
