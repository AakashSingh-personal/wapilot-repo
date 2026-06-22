import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { getStaffShiftForDate } from './shift.service.js';

// Haversine distance in metres between two lat/lng points.
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayDate(timezone = 'Asia/Kolkata') {
  return new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  );
}

// Validates geo coordinates against the location's geo-fence.
// Returns { outsideRadius, distanceM, action } — action is null when within radius.
async function evaluateGeoFence(locationId, lat, lng) {
  if (!locationId || lat == null || lng == null) {
    return { outsideRadius: false, distanceM: null, action: null };
  }
  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc || !loc.geoFenceEnabled || loc.latitude == null || loc.longitude == null) {
    return { outsideRadius: false, distanceM: null, action: null };
  }
  const distanceM = Math.round(
    haversineMetres(Number(loc.latitude), Number(loc.longitude), lat, lng)
  );
  const outsideRadius = distanceM > loc.allowedRadiusMeters;
  return {
    outsideRadius,
    distanceM,
    action: outsideRadius ? loc.outsideRadiusAction : null,
    allowedRadius: loc.allowedRadiusMeters,
  };
}

export async function checkIn({
  businessId,
  staffId,
  locationId,
  lat,
  lng,
  source = 'GEO',
  deviceInfo = {},
  selfieUrl = null,
}) {
  const geo = await evaluateGeoFence(locationId, lat, lng);

  if (geo.outsideRadius && geo.action === 'REJECT') {
    const err = new Error(
      `Check-in rejected: ${geo.distanceM}m from location (limit: ${geo.allowedRadius}m).`
    );
    err.statusCode = 422;
    err.code = 'GEO_OUTSIDE_RADIUS';
    throw err;
  }

  const date = todayDate();
  const now = new Date();

  // Determine if check-in is late relative to assigned shift.
  const shift = await getStaffShiftForDate(staffId, date);
  let isLate = false;
  if (shift && shift.startTime) {
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const shiftStartMins = sh * 60 + sm;
    const checkInMins = now.getHours() * 60 + now.getMinutes();
    isLate = checkInMins > shiftStartMins + (shift.graceLateMinutes || 0);
  }

  const record = await prisma.attendanceRecord.upsert({
    where: { businessId_staffId_date: { businessId, staffId, date } },
    create: {
      businessId,
      staffId,
      locationId: locationId || null,
      date,
      status: 'PRESENT',
      checkInTime: now,
      checkInLat: lat ? parseFloat(lat) : null,
      checkInLng: lng ? parseFloat(lng) : null,
      checkInSource: source,
      checkInDeviceInfo: deviceInfo,
      checkInSelfieUrl: selfieUrl,
      checkInDistanceM: geo.distanceM,
      outsideRadius: geo.outsideRadius,
    },
    update: {
      // Idempotent re-check-in: update geo data but keep original time if already set.
      checkInLat: lat ? parseFloat(lat) : undefined,
      checkInLng: lng ? parseFloat(lng) : undefined,
      checkInDistanceM: geo.distanceM,
      outsideRadius: geo.outsideRadius,
    },
  });

  return {
    record,
    outsideRadius: geo.outsideRadius,
    distanceM: geo.distanceM,
    requiresApproval: geo.outsideRadius && geo.action === 'REQUIRE_APPROVAL',
    warning: geo.outsideRadius && geo.action === 'WARN',
    isLate,
    shiftName: shift?.name ?? null,
  };
}

export async function checkOut({ businessId, staffId, lat, lng }) {
  const date = todayDate();
  const existing = await prisma.attendanceRecord.findUnique({
    where: { businessId_staffId_date: { businessId, staffId, date } },
  });

  if (!existing) {
    const err = new Error('No check-in found for today.');
    err.statusCode = 422;
    err.code = 'NO_CHECKIN';
    throw err;
  }
  if (existing.checkOutTime) {
    const err = new Error('Already checked out today.');
    err.statusCode = 422;
    err.code = 'ALREADY_CHECKED_OUT';
    throw err;
  }

  const now = new Date();
  const workingMinutes = existing.checkInTime
    ? Math.round((now - existing.checkInTime) / 60_000)
    : null;

  return prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: {
      checkOutTime: now,
      checkOutLat: lat ? parseFloat(lat) : null,
      checkOutLng: lng ? parseFloat(lng) : null,
      workingMinutes,
      status: workingMinutes && workingMinutes < 240 ? 'HALF_DAY' : 'PRESENT',
    },
  });
}

export async function checkInByQr({ businessId, qrToken, lat, lng, deviceInfo }) {
  const staff = await prisma.staffMember.findFirst({
    where: { businessId, qrToken, deletedAt: null },
  });
  if (!staff) {
    const err = new Error('Invalid QR code.');
    err.statusCode = 404;
    err.code = 'INVALID_QR';
    throw err;
  }
  // Use primary location
  const primaryLink = await prisma.staffLocation.findFirst({
    where: { staffId: staff.id, isPrimary: true },
  });
  return checkIn({
    businessId,
    staffId: staff.id,
    locationId: primaryLink?.locationId ?? null,
    lat,
    lng,
    source: 'QR',
    deviceInfo,
  });
}

export async function approveAttendance({ businessId, recordId, approverId }) {
  const record = await prisma.attendanceRecord.findFirst({
    where: { id: recordId, businessId },
  });
  if (!record) {
    const err = new Error('Attendance record not found.');
    err.statusCode = 404;
    throw err;
  }
  return prisma.attendanceRecord.update({
    where: { id: recordId },
    data: { approvedById: approverId, approvedAt: new Date() },
  });
}

export async function listAttendance({
  businessId,
  date,
  staffId,
  locationId,
  page = 1,
  pageSize = 50,
}) {
  const where = { businessId };
  if (date) where.date = new Date(date);
  if (staffId) where.staffId = staffId;
  if (locationId) where.locationId = locationId;

  const [total, records] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, designation: true, profilePicture: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { checkInTime: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, records };
}

export async function getDashboardSummary({ businessId, date }) {
  const d = date ? new Date(date) : todayDate();
  const records = await prisma.attendanceRecord.findMany({
    where: { businessId, date: d },
    include: { staff: { select: { id: true, name: true, profilePicture: true } } },
  });

  const totalStaff = await prisma.staffMember.count({
    where: { businessId, activeStatus: 'ACTIVE', deletedAt: null },
  });

  const summary = {
    date: d.toISOString().slice(0, 10),
    totalStaff,
    present: 0,
    absent: 0,
    halfDay: 0,
    late: 0,
    earlyDeparture: 0,
    onLeave: 0,
    fieldDuty: 0,
    wfh: 0,
    pendingApproval: 0,
    records,
  };

  for (const r of records) {
    if (r.status === 'PRESENT') summary.present++;
    else if (r.status === 'HALF_DAY') summary.halfDay++;
    else if (r.status === 'LEAVE') summary.onLeave++;
    else if (r.status === 'FIELD_DUTY') summary.fieldDuty++;
    else if (r.status === 'WFH') summary.wfh++;
    if (r.outsideRadius && !r.approvedAt) summary.pendingApproval++;
  }
  summary.absent = totalStaff - records.length;

  return summary;
}

// Generate or regenerate a QR token for a staff member.
export async function generateStaffQrToken({ businessId, staffId }) {
  const staff = await prisma.staffMember.findFirst({
    where: { id: staffId, businessId, deletedAt: null },
  });
  if (!staff) {
    const err = new Error('Staff not found.');
    err.statusCode = 404;
    throw err;
  }
  const qrToken = crypto.randomBytes(24).toString('hex');
  const updated = await prisma.staffMember.update({
    where: { id: staffId },
    data: { qrToken },
    select: { id: true, name: true, qrToken: true },
  });
  return updated;
}

export async function markManualAttendance({
  businessId,
  staffId,
  date,
  status,
  notes,
  createdById,
}) {
  const d = new Date(date);
  return prisma.attendanceRecord.upsert({
    where: { businessId_staffId_date: { businessId, staffId, date: d } },
    create: {
      businessId,
      staffId,
      date: d,
      status,
      checkInSource: 'MANUAL',
      notes,
    },
    update: { status, notes },
  });
}
