import { prisma } from '../lib/prisma.js';
import {
  createStaffProfilePresignedUpload,
  isS3Configured,
  uploadStaffProfileBase64,
} from '../services/storage.service.js';
import { findAvailableSlots } from '../scheduling/slotEngine.service.js';
import {
  createAppointment,
  updateAppointmentStatus,
  confirmPendingAppointments,
  checkInTodayAppointments,
  getSameDayCustomerWarnings,
  rescheduleAppointment,
  recordAppointmentPayment,
  ensureSchedulingDefaults,
} from '../scheduling/appointment.service.js';
import { joinWaitlist, cancelWaitlistEntry } from '../scheduling/waitlist.service.js';
import { buildManageAppointmentUrl } from '../scheduling/appointmentLinks.service.js';
import {
  buildPublicBookingUrl,
  createPublicBooking,
  getPublicBookingCatalog,
  getPublicBookingSlots,
  joinPublicWaitlist,
  resolvePublicBookingBusinessId,
} from '../scheduling/publicBooking.service.js';
import {
  getSchedulingAnalytics,
  getBusinessTodaySchedule,
  getSchedulingDashboardSummary,
  getStaffTodaySchedule,
  getStaffUpcomingSchedule,
} from '../scheduling/analytics.service.js';
import { findOrCreateCustomer } from '../scheduling/customer.service.js';
import { buildAppointmentIcs } from '../scheduling/ics.service.js';
import { verifyToken } from '../utils/jwt.js';
import {
  buildGoogleAuthUrl,
  handleGoogleOAuthCallback,
  isGoogleCalendarConfigured,
  listCalendarConnections,
  handleGoogleCalendarWebhook,
  registerGoogleCalendarWatch,
} from '../scheduling/googleCalendar.service.js';
import {
  buildOutlookAuthUrl,
  handleOutlookOAuthCallback,
  isOutlookCalendarConfigured,
  handleOutlookCalendarWebhook,
  renewOutlookSubscription,
} from '../scheduling/outlookCalendar.service.js';
import { pullCalendarBlocks } from '../scheduling/calendarSync.service.js';
import {
  getSchedulingSettings,
  updateSchedulingSettings,
} from '../scheduling/schedulingSettings.service.js';
import {
  connectAppleCalendar,
  isAppleCalendarAvailable,
} from '../scheduling/appleCalendar.service.js';
import { createAppointmentPaymentIntent } from '../scheduling/appointmentPayment.service.js';
import { getCustomerAppointmentStats, refreshCustomerAppointmentStats } from '../scheduling/customerStats.service.js';
import { resolveAppointmentActionToken } from '../scheduling/appointmentToken.service.js';
import { sendRebookingCampaign } from '../scheduling/rebooking.service.js';
import { presetToRrule } from '../scheduling/rrule.service.js';
import { withBookingIdempotency } from '../scheduling/idempotency.service.js';
import QRCode from 'qrcode';

function frontendBaseUrl() {
  const fromEnv = (process.env.CORS_ORIGIN || '').split(',')[0]?.trim();
  return fromEnv || 'http://localhost:5173';
}

const apptInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  staff: { select: { id: true, name: true, designation: true, mobile: true, email: true } },
  service: true,
  location: true,
};

function tenant(req) {
  return req.user.businessId;
}

function appointmentSearchFilter(q) {
  const term = String(q || '').trim();
  if (!term) return null;
  const digits = term.replace(/\D/g, '');
  const or = [
    { appointmentNumber: { contains: term, mode: 'insensitive' } },
    { customer: { name: { contains: term, mode: 'insensitive' } } },
  ];
  if (digits.length >= 4) {
    or.push({ customer: { phone: { contains: digits } } });
  }
  return { OR: or };
}

export async function seedDefaults(req, res, next) {
  try {
    const data = await ensureSchedulingDefaults(tenant(req));
    res.json(data);
  } catch (e) {
    next(e);
  }
}

// ─── Locations ───
export async function listLocations(req, res, next) {
  try {
    const rows = await prisma.location.findMany({
      where: { businessId: tenant(req), deletedAt: null },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createLocation(req, res, next) {
  try {
    const { code, name, timezone, addressLine1, city, phone, mediaUrls } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'code and name required' });
    const urls = Array.isArray(mediaUrls) ? mediaUrls.filter(Boolean) : [];
    const row = await prisma.location.create({
      data: {
        businessId: tenant(req),
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        timezone: timezone || 'Asia/Kolkata',
        addressLine1,
        city,
        phone,
        mediaUrls: urls,
        imageUrl: urls[0] || null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateLocation(req, res, next) {
  try {
    const body = req.body || {};
    const existing = await prisma.location.findFirst({
      where: { id: req.params.id, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    const updateData = {
      name: body.name,
      timezone: body.timezone,
      addressLine1: body.addressLine1,
      city: body.city,
      phone: body.phone,
      isActive: body.isActive,
    };
    if (body.mediaUrls !== undefined) {
      const urls = Array.isArray(body.mediaUrls) ? body.mediaUrls.filter(Boolean) : [];
      updateData.mediaUrls = urls;
      updateData.imageUrl = urls[0] || null;
    }
    const row = await prisma.location.update({
      where: { id: existing.id },
      data: updateData,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

// ─── Staff ───
export async function listStaff(req, res, next) {
  try {
    const rows = await prisma.staffMember.findMany({
      where: { businessId: tenant(req), deletedAt: null },
      include: {
        locations: { include: { location: true } },
        services: { include: { service: true } },
        user: { select: { id: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createStaff(req, res, next) {
  try {
    const body = req.body || {};
    if (!body.staffCode || !body.name) {
      return res.status(400).json({ error: 'staffCode and name required' });
    }
    if (body.profilePicture && !/^https:\/\//i.test(String(body.profilePicture))) {
      return res.status(400).json({ error: 'profilePicture must be an HTTPS URL' });
    }
    const row = await prisma.staffMember.create({
      data: {
        businessId: tenant(req),
        staffCode: body.staffCode,
        name: body.name,
        email: body.email,
        mobile: body.mobile,
        designation: body.designation,
        department: body.department,
        bio: body.bio,
        skills: body.skills || [],
        profilePicture: body.profilePicture,
        userId: body.userId || null,
        createdById: req.user.userId,
        locations: body.locationIds?.length
          ? {
              create: body.locationIds.map((locationId, i) => ({
                locationId,
                isPrimary: i === 0,
              })),
            }
          : undefined,
        services: body.serviceIds?.length
          ? { create: body.serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
      },
      include: { locations: { include: { location: true } }, services: { include: { service: true } } },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateStaff(req, res, next) {
  try {
    const body = req.body || {};
    const existing = await prisma.staffMember.findFirst({
      where: { id: req.params.id, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    if (body.profilePicture && !/^https:\/\//i.test(String(body.profilePicture))) {
      return res.status(400).json({ error: 'profilePicture must be an HTTPS URL' });
    }

    const data = {
      name: body.name,
      email: body.email,
      mobile: body.mobile,
      designation: body.designation,
      department: body.department,
      bio: body.bio,
      skills: body.skills,
      profilePicture: body.profilePicture,
      activeStatus: body.activeStatus,
      updatedById: req.user.userId,
    };

    if (body.userId !== undefined) {
      if (!body.userId) {
        data.userId = null;
      } else {
        const user = await prisma.user.findFirst({
          where: { id: body.userId, businessId: tenant(req) },
        });
        if (!user) return res.status(400).json({ error: 'User not found in this business' });
        const taken = await prisma.staffMember.findFirst({
          where: {
            businessId: tenant(req),
            userId: body.userId,
            deletedAt: null,
            id: { not: existing.id },
          },
        });
        if (taken) return res.status(400).json({ error: 'User already linked to another staff profile' });
        data.userId = body.userId;
      }
    }

    const row = await prisma.staffMember.update({
      where: { id: existing.id },
      data,
    });

    if (Array.isArray(body.serviceIds)) {
      await prisma.staffService.deleteMany({ where: { staffId: row.id } });
      if (body.serviceIds.length) {
        await prisma.staffService.createMany({
          data: body.serviceIds.map((serviceId) => ({ staffId: row.id, serviceId })),
        });
      }
    }
    if (Array.isArray(body.locationIds)) {
      await prisma.staffLocation.deleteMany({ where: { staffId: row.id } });
      if (body.locationIds.length) {
        await prisma.staffLocation.createMany({
          data: body.locationIds.map((locationId, i) => ({
            staffId: row.id,
            locationId,
            isPrimary: i === 0,
          })),
        });
      }
    }
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteStaff(req, res, next) {
  try {
    const row = await prisma.staffMember.updateMany({
      where: { id: req.params.id, businessId: tenant(req) },
      data: { deletedAt: new Date(), activeStatus: 'ARCHIVED' },
    });
    if (!row.count) return res.status(404).json({ error: 'Staff not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function presignStaffProfilePicture(req, res, next) {
  try {
    const staffId = req.params.id;
    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    const body = req.body || {};
    const presigned = await createStaffProfilePresignedUpload({
      businessId: tenant(req),
      staffId,
      mimeType: body.mimeType,
      fileName: body.fileName,
    });
    res.json(presigned);
  } catch (e) {
    if (e.code === 'S3_NOT_CONFIGURED') {
      return res.status(501).json({ error: e.message, fallback: 'upload' });
    }
    next(e);
  }
}

export async function uploadStaffProfilePicture(req, res, next) {
  try {
    const staffId = req.params.id;
    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    const body = req.body || {};
    const uploaded = await uploadStaffProfileBase64({
      businessId: tenant(req),
      staffId,
      base64Data: body.base64Data,
      mimeType: body.mimeType,
      fileName: body.fileName,
    });

    const row = await prisma.staffMember.update({
      where: { id: staffId },
      data: { profilePicture: uploaded.publicUrl, updatedById: req.user.userId },
    });
    res.json({ ...row, upload: uploaded });
  } catch (e) {
    next(e);
  }
}

export async function confirmStaffProfilePicture(req, res, next) {
  try {
    const staffId = req.params.id;
    const body = req.body || {};
    if (!body.publicUrl) return res.status(400).json({ error: 'publicUrl required' });
    // Enforce HTTPS — same guard applied in createStaff / updateStaff.
    if (!/^https:\/\//i.test(String(body.publicUrl))) {
      return res.status(400).json({ error: 'publicUrl must be an HTTPS URL' });
    }

    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Staff not found' });

    const row = await prisma.staffMember.update({
      where: { id: staffId },
      data: { profilePicture: body.publicUrl, updatedById: req.user.userId },
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function getStaffStorageCapabilities(_req, res) {
  res.json({
    s3Presign: isS3Configured(),
    supabaseFallback: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}

// ─── Services ───
export async function listServices(req, res, next) {
  try {
    const rows = await prisma.scheduledService.findMany({
      where: { businessId: tenant(req), deletedAt: null },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createService(req, res, next) {
  try {
    const b = req.body || {};
    if (!b.code || !b.name || !b.durationMin) {
      return res.status(400).json({ error: 'code, name, durationMin required' });
    }
    const row = await prisma.scheduledService.create({
      data: {
        businessId: tenant(req),
        code: b.code,
        name: b.name,
        description: b.description,
        durationMin: Number(b.durationMin),
        price: b.price ?? 0,
        taxPercent: b.taxPercent ?? 0,
        bufferBefore: b.bufferBefore ?? 0,
        bufferAfter: b.bufferAfter ?? 0,
        maxCapacity: b.maxCapacity ?? 1,
        categoryId: b.categoryId || null,
        imageUrl: b.imageUrl?.trim() || null,
        rebookingIntervalDays:
          b.rebookingIntervalDays != null ? Number(b.rebookingIntervalDays) : undefined,
      },
    });
    if (b.linkAllStaff !== false) {
      const staffRows = await prisma.staffMember.findMany({
        where: { businessId: tenant(req), deletedAt: null, activeStatus: 'ACTIVE' },
        select: { id: true },
      });
      if (staffRows.length) {
        await prisma.staffService.createMany({
          data: staffRows.map((s) => ({ staffId: s.id, serviceId: row.id })),
          skipDuplicates: true,
        });
      }
    }
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateService(req, res, next) {
  try {
    const b = req.body || {};
    const existing = await prisma.scheduledService.findFirst({
      where: { id: req.params.id, businessId: tenant(req), deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Service not found' });
    const row = await prisma.scheduledService.update({
      where: { id: existing.id },
      data: {
        name: b.name,
        description: b.description,
        durationMin: b.durationMin != null ? Number(b.durationMin) : undefined,
        price: b.price,
        taxPercent: b.taxPercent,
        bufferBefore: b.bufferBefore,
        bufferAfter: b.bufferAfter,
        maxCapacity: b.maxCapacity,
        isActive: b.isActive,
        categoryId: b.categoryId !== undefined ? b.categoryId || null : undefined,
        imageUrl: b.imageUrl !== undefined ? (b.imageUrl?.trim() || null) : undefined,
        rebookingIntervalDays:
          b.rebookingIntervalDays != null ? Number(b.rebookingIntervalDays) : undefined,
      },
      include: { category: true },
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function listServiceCategories(req, res, next) {
  try {
    const rows = await prisma.serviceCategory.findMany({
      where: { businessId: tenant(req) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { services: true } } },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createServiceCategory(req, res, next) {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name required' });
    const row = await prisma.serviceCategory.create({
      data: {
        businessId: tenant(req),
        name: String(b.name).trim(),
        sortOrder: b.sortOrder != null ? Number(b.sortOrder) : 0,
        isActive: b.isActive !== false,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateServiceCategory(req, res, next) {
  try {
    const b = req.body || {};
    const existing = await prisma.serviceCategory.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    const row = await prisma.serviceCategory.update({
      where: { id: existing.id },
      data: {
        name: b.name != null ? String(b.name).trim() : undefined,
        sortOrder: b.sortOrder != null ? Number(b.sortOrder) : undefined,
        isActive: b.isActive,
      },
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteServiceCategory(req, res, next) {
  try {
    const existing = await prisma.serviceCategory.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    await prisma.$transaction([
      prisma.scheduledService.updateMany({
        where: { categoryId: existing.id },
        data: { categoryId: null },
      }),
      prisma.serviceCategory.delete({ where: { id: existing.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listLinkableUsers(req, res, next) {
  try {
    const rows = await prisma.user.findMany({
      where: { businessId: tenant(req), role: { in: ['OWNER', 'STAFF'] } },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

// ─── Working hours & leaves ───
export async function getWorkingHours(req, res, next) {
  try {
    const rows = await prisma.staffWorkingHours.findMany({
      where: { staffId: req.params.staffId, businessId: tenant(req) },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function putWorkingHours(req, res, next) {
  try {
    const { hours = [] } = req.body || {};
    const staffId = req.params.staffId;
    const businessId = tenant(req);
    const staff = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId, deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    await prisma.staffWorkingHours.deleteMany({ where: { staffId, businessId } });
    if (hours.length) {
      await prisma.staffWorkingHours.createMany({
        data: hours.map((h) => ({
          businessId,
          staffId,
          locationId: h.locationId || null,
          dayOfWeek: Number(h.dayOfWeek),
          startTime: h.startTime,
          endTime: h.endTime,
          isActive: h.isActive !== false,
        })),
      });
    }
    const rows = await prisma.staffWorkingHours.findMany({ where: { staffId, businessId } });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createLeave(req, res, next) {
  try {
    const b = req.body || {};
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.params.staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const row = await prisma.staffLeave.create({
      data: {
        businessId: tenant(req),
        staffId: staff.id,
        leaveType: b.leaveType || 'OTHER',
        startAt: new Date(b.startAt),
        endAt: new Date(b.endAt),
        reason: b.reason,
        approvedById: req.user.userId,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function listStaffLeaves(req, res, next) {
  try {
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.params.staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const rows = await prisma.staffLeave.findMany({
      where: { staffId: staff.id, businessId: tenant(req) },
      orderBy: { startAt: 'desc' },
      take: 50,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function deleteStaffLeave(req, res, next) {
  try {
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.params.staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const row = await prisma.staffLeave.deleteMany({
      where: { id: req.params.leaveId, staffId: staff.id, businessId: tenant(req) },
    });
    if (!row.count) return res.status(404).json({ error: 'Leave not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listBreaks(req, res, next) {
  try {
    const staffId = req.params.staffId;
    // Verify staff belongs to the caller's business before exposing break schedule.
    const staff = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const rows = await prisma.staffBreak.findMany({
      where: { staffId: staff.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createBreak(req, res, next) {
  try {
    const b = req.body || {};
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.params.staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const row = await prisma.staffBreak.create({
      data: {
        staffId: staff.id,
        locationId: b.locationId || null,
        dayOfWeek: b.dayOfWeek != null ? Number(b.dayOfWeek) : null,
        startTime: b.startTime,
        endTime: b.endTime,
        breakType: b.breakType || 'LUNCH',
        isRecurring: b.isRecurring !== false,
        specificDate: b.specificDate ? new Date(b.specificDate) : null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteBreak(req, res, next) {
  try {
    // Verify staff belongs to the caller's business to prevent cross-tenant deletion.
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.params.staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const br = await prisma.staffBreak.findFirst({
      where: { id: req.params.breakId, staffId: staff.id },
    });
    if (!br) return res.status(404).json({ error: 'Break not found' });
    await prisma.staffBreak.delete({ where: { id: br.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listHolidays(req, res, next) {
  try {
    const rows = await prisma.businessHoliday.findMany({
      where: { businessId: tenant(req) },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { startAt: 'asc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createHoliday(req, res, next) {
  try {
    const b = req.body || {};
    if (!b.name || !b.startAt) {
      return res.status(400).json({ error: 'name and startAt required' });
    }
    const startAt = new Date(b.startAt);
    const endAt = new Date(b.endAt || b.startAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'Invalid startAt or endAt' });
    }
    const row = await prisma.businessHoliday.create({
      data: {
        businessId: tenant(req),
        locationId: b.locationId || null,
        name: String(b.name).trim(),
        startAt,
        endAt,
        isRecurring: Boolean(b.isRecurring),
        rrule: b.rrule || null,
      },
      include: { location: { select: { id: true, name: true } } },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteHoliday(req, res, next) {
  try {
    const row = await prisma.businessHoliday.deleteMany({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!row.count) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

// ─── Slots & Appointments ───
export async function getAvailableSlots(req, res, next) {
  try {
    const { serviceId, locationId, staffId, date } = req.query;
    if (!serviceId || !date) {
      return res.status(400).json({ error: 'serviceId and date required' });
    }
    const slots = await findAvailableSlots({
      businessId: tenant(req),
      serviceId,
      locationId: locationId || undefined,
      staffId: staffId || undefined,
      date,
    });
    res.json({ date, slots });
  } catch (e) {
    next(e);
  }
}

export async function listAppointments(req, res, next) {
  try {
    const { status, staffId, customerId, from, to, q, page: pageRaw, pageSize: pageSizeRaw } = req.query;
    const where = { businessId: tenant(req) };
    if (status) where.status = status;
    if (staffId) where.staffId = staffId;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    const search = appointmentSearchFilter(q);
    if (search) Object.assign(where, search);

    const page = Math.max(1, Number(pageRaw) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw) || 50));
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: apptInclude,
        orderBy: { startAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    res.json({
      items: rows,
      total,
      page,
      pageSize,
      totalPages,
      hasMore: skip + rows.length < total,
    });
  } catch (e) {
    next(e);
  }
}

export async function createAppointmentHandler(req, res, next) {
  try {
    await ensureSchedulingDefaults(tenant(req));
    const b = req.body || {};
    const idempotencyKey =
      req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || b.idempotencyKey;

    const { appointment, paymentIntent, replayed } = await withBookingIdempotency({
      businessId: tenant(req),
      idempotencyKey,
      include: apptInclude,
      run: () =>
        createAppointment({
          businessId: tenant(req),
          customerId: b.customerId,
          staffId: b.staffId,
          serviceId: b.serviceId,
          locationId: b.locationId,
          startAt: b.startAt,
          appointmentType: b.appointmentType,
          notes: b.notes,
          source: 'DASHBOARD',
          createdById: req.user.userId,
          meetingLink: b.meetingLink,
          address: b.address,
          status: b.status || 'CONFIRMED',
          collectAdvance: Boolean(b.collectAdvance),
          advancePercent: b.advancePercent,
        }),
    });

    const warnings = await getSameDayCustomerWarnings(
      tenant(req),
      appointment.customerId,
      appointment.startAt,
      appointment.id,
    );

    res.status(replayed ? 200 : 201).json({
      ...appointment,
      paymentIntent,
      warnings,
      replayed: Boolean(replayed),
    });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
    next(e);
  }
}

export async function downloadAppointmentIcs(req, res, next) {
  try {
    const row = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
      include: apptInclude,
    });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });
    const ics = buildAppointmentIcs(row);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${row.appointmentNumber || 'appointment'}.ics"`,
    );
    res.send(ics);
  } catch (e) {
    next(e);
  }
}

export async function downloadPublicAppointmentIcs(req, res, next) {
  try {
    const payload = resolveAppointmentActionToken(req.params.token);
    const row = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
      include: apptInclude,
    });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });
    const ics = buildAppointmentIcs(row);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${row.appointmentNumber || 'appointment'}.ics"`,
    );
    res.send(ics);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function schedulingDashboardSummary(req, res, next) {
  try {
    const data = await getSchedulingDashboardSummary(tenant(req));
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getAppointment(req, res, next) {
  try {
    const row = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
      include: {
        ...apptInclude,
        payments: true,
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
        rating: true,
        calendarEvents: { include: { connection: { select: { provider: true, externalEmail: true } } } },
        reminders: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function patchAppointment(req, res, next) {
  try {
    const b = req.body || {};
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const row = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        notes: b.notes !== undefined ? b.notes : undefined,
        internalNotes: b.internalNotes !== undefined ? b.internalNotes : undefined,
      },
      include: apptInclude,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function exportAppointmentsCsv(req, res, next) {
  try {
    const { status, staffId, customerId, from, to, q } = req.query;
    const where = { businessId: tenant(req) };
    if (status) where.status = status;
    if (staffId) where.staffId = staffId;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    const search = appointmentSearchFilter(q);
    if (search) Object.assign(where, search);
    const rows = await prisma.appointment.findMany({
      where,
      include: apptInclude,
      orderBy: { startAt: 'desc' },
      take: 2000,
    });

    const escape = (v) => {
      const s = String(v ?? '');
      // Prefix formula-starting characters to prevent CSV injection in Excel / LibreOffice.
      const safe = /^[=+@\-]/.test(s) ? `'${s}` : s;
      return safe.includes(',') || safe.includes('"') || safe.includes('\n')
        ? `"${safe.replace(/"/g, '""')}"`
        : safe;
    };

    const header = [
      'Ref',
      'Customer',
      'Phone',
      'Service',
      'Staff',
      'Location',
      'Start',
      'Status',
      'Source',
      'Payment',
      'Amount',
      'Paid',
      'Due',
    ].join(',');

    const lines = rows.map((a) =>
      [
        a.appointmentNumber,
        a.customer?.name,
        a.customer?.phone,
        a.service?.name,
        a.staff?.name,
        a.location?.name,
        new Date(a.startAt).toISOString(),
        a.status,
        a.source,
        a.paymentStatus,
        a.amount,
        a.amountPaid,
        a.amountDue,
      ]
        .map(escape)
        .join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="appointments.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (e) {
    next(e);
  }
}

export async function patchAppointmentStatus(req, res, next) {
  try {
    const { status, reason } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status required' });
    const row = await updateAppointmentStatus({
      businessId: tenant(req),
      appointmentId: req.params.id,
      toStatus: status,
      changedById: req.user.userId,
      reason,
    });
    res.json(row);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function confirmPendingAppointmentsHandler(req, res, next) {
  try {
    const limit = Number(req.body?.limit) || 100;
    const result = await confirmPendingAppointments({
      businessId: tenant(req),
      changedById: req.user.userId,
      limit,
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function checkInTodayAppointmentsHandler(req, res, next) {
  try {
    const { staffId } = req.body || {};
    const result = await checkInTodayAppointments({
      businessId: tenant(req),
      changedById: req.user.userId,
      staffId: staffId || null,
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function sendAppointmentNotificationsHandler(req, res, next) {
  try {
    const { sendTestNotificationsForAppointment } = await import('../scheduling/reminder.service.js');
    const sent = await sendTestNotificationsForAppointment(req.params.id, tenant(req));
    res.json(sent);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function rescheduleAppointmentHandler(req, res, next) {
  try {
    const { newStartAt, reason } = req.body || {};
    if (!newStartAt) return res.status(400).json({ error: 'newStartAt required' });
    const row = await rescheduleAppointment({
      businessId: tenant(req),
      appointmentId: req.params.id,
      newStartAt,
      changedById: req.user.userId,
      reason,
    });
    res.json({ ...row.appointment, paymentIntent: row.paymentIntent });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
    next(e);
  }
}

export async function recordPaymentHandler(req, res, next) {
  try {
    const b = req.body || {};
    const result = await recordAppointmentPayment({
      businessId: tenant(req),
      appointmentId: req.params.id,
      amount: b.amount,
      paymentMethod: b.paymentMethod || 'CASH',
      transactionId: b.transactionId,
      provider: b.provider,
      status: b.status || 'PAID',
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function joinWaitlistHandler(req, res, next) {
  try {
    const b = req.body || {};
    const row = await joinWaitlist({
      businessId: tenant(req),
      customerId: b.customerId,
      serviceId: b.serviceId,
      locationId: b.locationId,
      staffId: b.staffId,
      preferredDate: b.preferredDate,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function listWaitlist(req, res, next) {
  try {
    const rows = await prisma.waitlistEntry.findMany({
      where: { businessId: tenant(req), status: { in: ['ACTIVE', 'NOTIFIED'] } },
      include: { customer: true, service: true, location: true, staff: true },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function exportWaitlistCsv(req, res, next) {
  try {
    const rows = await prisma.waitlistEntry.findMany({
      where: { businessId: tenant(req), status: { in: ['ACTIVE', 'NOTIFIED'] } },
      include: { customer: true, service: true, location: true, staff: true },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      take: 2000,
    });

    const escape = (v) => {
      const s = String(v ?? '');
      // Prefix formula-starting characters to prevent CSV injection in Excel / LibreOffice.
      const safe = /^[=+@\-]/.test(s) ? `'${s}` : s;
      return safe.includes(',') || safe.includes('"') || safe.includes('\n')
        ? `"${safe.replace(/"/g, '""')}"`
        : safe;
    };

    const header = [
      'Customer',
      'Phone',
      'Service',
      'Location',
      'Staff',
      'PreferredDate',
      'Status',
      'Priority',
      'Created',
    ].join(',');

    const lines = rows.map((w) =>
      [
        w.customer?.name,
        w.customer?.phone,
        w.service?.name,
        w.location?.name,
        w.staff?.name,
        w.preferredDate ? new Date(w.preferredDate).toISOString().slice(0, 10) : '',
        w.status,
        w.priorityScore,
        new Date(w.createdAt).toISOString(),
      ]
        .map(escape)
        .join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (e) {
    next(e);
  }
}

export async function cancelWaitlistHandler(req, res, next) {
  try {
    const row = await cancelWaitlistEntry({ businessId: tenant(req), entryId: req.params.id });
    res.json(row);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getAppointmentManageLink(req, res, next) {
  try {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
      select: { id: true, businessId: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ url: buildManageAppointmentUrl(appt.id, appt.businessId) });
  } catch (e) {
    next(e);
  }
}

export async function rateAppointment(req, res, next) {
  try {
    const { rating, feedback } = req.body || {};
    const score = Number(rating);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'rating must be 1–5' });
    }
    const safeFeedback = feedback ? String(feedback).slice(0, 2000) : null;
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const row = await prisma.appointmentRating.upsert({
      where: { appointmentId: appt.id },
      create: {
        businessId: tenant(req),
        appointmentId: appt.id,
        customerId: appt.customerId,
        staffId: appt.staffId,
        serviceId: appt.serviceId,
        rating: score,
        feedback: safeFeedback,
      },
      update: { rating: score, feedback: safeFeedback },
    });
    void refreshCustomerAppointmentStats(tenant(req), appt.customerId).catch(() => {});
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function listRecentRatings(req, res, next) {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await prisma.appointmentRating.findMany({
      where: { businessId: tenant(req), createdAt: { gte: since } },
      include: {
        appointment: { select: { appointmentNumber: true, startAt: true } },
        customer: { select: { name: true, phone: true } },
        staff: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function quickCreateCustomer(req, res, next) {
  try {
    const { phone, name, email } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const customer = await findOrCreateCustomer({
      businessId: tenant(req),
      phone,
      name,
      email,
    });
    res.status(201).json(customer);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function businessScheduleToday(req, res, next) {
  try {
    const rows = await getBusinessTodaySchedule(tenant(req));
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function analyticsSummary(req, res, next) {
  try {
    const data = await getSchedulingAnalytics(tenant(req), {
      days: Math.min(365, Math.max(1, Number(req.query.days) || 30)),
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function staffScheduleToday(req, res, next) {
  try {
    let staffId = req.params.staffId;
    if (staffId === 'me') {
      const profile = await prisma.staffMember.findFirst({
        where: { businessId: tenant(req), userId: req.user.userId, deletedAt: null },
      });
      if (!profile) return res.status(404).json({ error: 'Staff profile not linked to user' });
      staffId = profile.id;
    }
    const rows = await getStaffTodaySchedule(tenant(req), staffId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function staffScheduleUpcoming(req, res, next) {
  try {
    let staffId = req.params.staffId;
    if (staffId === 'me') {
      const profile = await prisma.staffMember.findFirst({
        where: { businessId: tenant(req), userId: req.user.userId, deletedAt: null },
      });
      if (!profile) return res.status(404).json({ error: 'Staff profile not linked to user' });
      staffId = profile.id;
    }
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    const rows = await getStaffUpcomingSchedule(tenant(req), staffId, { days });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

// Public self-service via signed token
export async function getPublicAppointment(req, res, next) {
  try {
    const payload = resolveAppointmentActionToken(req.params.token);
    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
      include: { ...apptInclude, rating: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appt);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getPublicAppointmentSlots(req, res, next) {
  try {
    const { token } = req.params;
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query required (YYYY-MM-DD)' });

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired link' });
    }
    if (payload.type !== 'appointment_action') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (!['PENDING', 'CONFIRMED'].includes(appt.status)) {
      return res.status(400).json({ error: 'Appointment cannot be rescheduled' });
    }

    const slots = await findAvailableSlots({
      businessId: payload.businessId,
      serviceId: appt.serviceId,
      locationId: appt.locationId,
      staffId: appt.staffId,
      date: String(date),
    });

    res.json({ date, slots });
  } catch (e) {
    next(e);
  }
}

const RATING_THROTTLE_MS = Number(process.env.RATING_THROTTLE_MS || 30_000); // 30 s

export async function publicRateAppointment(req, res, next) {
  try {
    const payload = resolveAppointmentActionToken(req.params.token);
    const { rating, feedback } = req.body || {};
    const score = Number(rating);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'rating must be 1–5' });
    }

    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Only completed appointments can be rated' });
    }

    // Throttle: if a rating already exists and was updated recently, reject re-submission.
    const existing = await prisma.appointmentRating.findUnique({
      where: { appointmentId: appt.id },
    });
    if (existing) {
      const msSinceUpdate = Date.now() - new Date(existing.updatedAt).getTime();
      if (msSinceUpdate < RATING_THROTTLE_MS) {
        const retryAfter = Math.ceil((RATING_THROTTLE_MS - msSinceUpdate) / 1000);
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({ error: `Rating already submitted. Please wait ${retryAfter}s before updating.` });
      }
    }

    const safeFeedback = feedback ? String(feedback).slice(0, 2000) : null;
    const row = await prisma.appointmentRating.upsert({
      where: { appointmentId: appt.id },
      create: {
        businessId: payload.businessId,
        appointmentId: appt.id,
        customerId: appt.customerId,
        staffId: appt.staffId,
        serviceId: appt.serviceId,
        rating: score,
        feedback: safeFeedback,
      },
      update: { rating: score, feedback: safeFeedback },
    });
    void refreshCustomerAppointmentStats(payload.businessId, appt.customerId).catch(() => {});
    res.json(row);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function publicAppointmentPayment(req, res, next) {
  try {
    const payload = resolveAppointmentActionToken(req.params.token);
    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (Number(appt.amountDue) <= 0) {
      return res.status(400).json({ error: 'Nothing due on this appointment' });
    }

    const result = await createAppointmentPaymentIntent({
      businessId: payload.businessId,
      appointmentId: appt.id,
      mode: req.body?.mode || 'advance',
      advancePercent: req.body?.advancePercent,
    });
    let qrDataUrl = null;
    if (result.paymentLinkUrl) {
      qrDataUrl = await QRCode.toDataURL(result.paymentLinkUrl);
    }
    res.json({ ...result, qrDataUrl });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function publicAppointmentAction(req, res, next) {
  try {
    const payload = resolveAppointmentActionToken(req.params.token);
    const { action, newStartAt } = req.body || {};

    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, businessId: payload.businessId },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    // Block mutations on appointments that are already finished or cancelled.
    const terminal = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];
    if (terminal.includes(appt.status)) {
      return res.status(409).json({
        error: `Appointment is already ${appt.status.toLowerCase()} and cannot be modified`,
      });
    }

    if (action === 'confirm') {
      const row = await updateAppointmentStatus({
        businessId: payload.businessId,
        appointmentId: appt.id,
        toStatus: 'CONFIRMED',
        reason: 'Customer confirmed via link',
      });
      return res.json(row);
    }
    if (action === 'cancel') {
      const reason =
        (req.body?.reason && String(req.body.reason).trim()) || 'Customer cancelled via link';
      const row = await updateAppointmentStatus({
        businessId: payload.businessId,
        appointmentId: appt.id,
        toStatus: 'CANCELLED',
        reason,
      });
      return res.json(row);
    }
    if (action === 'reschedule' && newStartAt) {
      const row = await rescheduleAppointment({
        businessId: payload.businessId,
        appointmentId: appt.id,
        newStartAt,
        reason: 'Customer rescheduled via link',
      });
      return res.json({ ...row.appointment, paymentIntent: row.paymentIntent });
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    next(e);
  }
}

export async function getPublicBookingCatalogHandler(req, res, next) {
  try {
    const businessId = resolvePublicBookingBusinessId(req.params.token);
    const data = await getPublicBookingCatalog(businessId);
    res.json(data);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getPublicBookingSlotsHandler(req, res, next) {
  try {
    const businessId = resolvePublicBookingBusinessId(req.params.token);
    const slots = await getPublicBookingSlots(businessId, req.query);
    res.json({ date: req.query.date, slots });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function createPublicBookingHandler(req, res, next) {
  try {
    const businessId = resolvePublicBookingBusinessId(req.params.token);
    const result = await createPublicBooking(businessId, req.body);
    res.status(201).json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
    next(e);
  }
}

export async function joinPublicWaitlistHandler(req, res, next) {
  try {
    const businessId = resolvePublicBookingBusinessId(req.params.token);
    const row = await joinPublicWaitlist(businessId, req.body);
    res.status(201).json(row);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getPublicBookingLink(req, res, next) {
  try {
    const settings = await getSchedulingSettings(tenant(req));
    res.json({
      enabled: settings.publicBookingEnabled,
      collectAdvance: settings.publicBookingCollectAdvance,
      url: buildPublicBookingUrl(tenant(req)),
    });
  } catch (e) {
    next(e);
  }
}

export async function listAppointmentsAsBookings(req, res, next) {
  try {
    const legacy = await prisma.booking.findMany({
      where: { businessId: tenant(req) },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const modern = await prisma.appointment.findMany({
      where: { businessId: tenant(req) },
      include: apptInclude,
      orderBy: { startAt: 'desc' },
      take: 200,
    });
    res.json({ legacyBookings: legacy, appointments: modern });
  } catch (e) {
    next(e);
  }
}

// ─── Google Calendar ───
export async function getGoogleCalendarAuthUrl(req, res, next) {
  try {
    if (!isGoogleCalendarConfigured()) {
      return res.status(503).json({ error: 'Google Calendar OAuth is not configured' });
    }
    const staffId = req.query.staffId || null;
    const url = buildGoogleAuthUrl({
      businessId: tenant(req),
      staffId,
      userId: req.user.userId,
    });
    res.json({ url });
  } catch (e) {
    next(e);
  }
}

export async function googleCalendarCallback(req, res, next) {
  try {
    const { code, state, error } = req.query;
    const frontend = frontendBaseUrl();
    const redirectTo = `${frontend}/scheduling?tab=calendar`;

    if (error) {
      return res.redirect(`${redirectTo}&error=${encodeURIComponent(String(error))}`);
    }
    if (!code || !state) {
      return res.redirect(`${redirectTo}&error=missing_code`);
    }

    await handleGoogleOAuthCallback(String(code), String(state));
    return res.redirect(`${redirectTo}&connected=1`);
  } catch (e) {
    return res.redirect(
      `${frontendBaseUrl()}/scheduling?tab=calendar&error=${encodeURIComponent(e.message || 'oauth_failed')}`,
    );
  }
}

export async function getOutlookCalendarAuthUrl(req, res, next) {
  try {
    if (!isOutlookCalendarConfigured()) {
      return res.status(503).json({ error: 'Outlook Calendar OAuth is not configured' });
    }
    const staffId = req.query.staffId || null;
    const url = buildOutlookAuthUrl({
      businessId: tenant(req),
      staffId,
      userId: req.user.userId,
    });
    res.json({ url });
  } catch (e) {
    next(e);
  }
}

export async function outlookCalendarCallback(req, res, next) {
  try {
    const { code, state, error } = req.query;
    const frontend = frontendBaseUrl();
    const redirectTo = `${frontend}/scheduling?tab=calendar`;

    if (error) {
      return res.redirect(`${redirectTo}&error=${encodeURIComponent(String(error))}`);
    }
    if (!code || !state) {
      return res.redirect(`${redirectTo}&error=missing_code`);
    }

    await handleOutlookOAuthCallback(String(code), String(state));
    return res.redirect(`${redirectTo}&connected=outlook`);
  } catch (e) {
    return res.redirect(
      `${frontendBaseUrl()}/scheduling?tab=calendar&error=${encodeURIComponent(e.message || 'oauth_failed')}`,
    );
  }
}

export async function listCalendarConnectionsHandler(req, res, next) {
  try {
    const rows = await listCalendarConnections(tenant(req));
    res.json({
      configured:
        isGoogleCalendarConfigured() || isOutlookCalendarConfigured() || isAppleCalendarAvailable(),
      googleConfigured: isGoogleCalendarConfigured(),
      outlookConfigured: isOutlookCalendarConfigured(),
      appleConfigured: isAppleCalendarAvailable(),
      connections: rows,
    });
  } catch (e) {
    next(e);
  }
}

export async function renewCalendarWebhookHandler(req, res, next) {
  try {
    const conn = await prisma.calendarConnection.findFirst({
      where: { id: req.params.connectionId, businessId: tenant(req), isActive: true },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    if (conn.provider === 'GOOGLE') {
      await registerGoogleCalendarWatch(conn.id);
    } else if (conn.provider === 'OUTLOOK') {
      await renewOutlookSubscription(conn.id);
    } else {
      return res.status(400).json({ error: 'Webhooks not supported for this provider' });
    }

    const updated = await prisma.calendarConnection.findUnique({
      where: { id: conn.id },
      select: {
        id: true,
        staffId: true,
        provider: true,
        externalEmail: true,
        lastSyncAt: true,
        webhookExpiresAt: true,
        webhookChannelId: true,
      },
    });
    res.json(updated);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function connectAppleCalendarHandler(req, res, next) {
  try {
    const { appleId, appPassword, staffId } = req.body || {};
    const conn = await connectAppleCalendar({
      businessId: tenant(req),
      staffId: staffId || null,
      appleId,
      appPassword,
    });
    res.status(201).json(conn);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getSchedulingSettingsHandler(req, res, next) {
  try {
    const settings = await getSchedulingSettings(tenant(req));
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

export async function updateSchedulingSettingsHandler(req, res, next) {
  try {
    const settings = await updateSchedulingSettings(tenant(req), req.body || {});
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

export async function syncCalendarConnectionHandler(req, res, next) {
  try {
    const conn = await prisma.calendarConnection.findFirst({
      where: { id: req.params.connectionId, businessId: tenant(req) },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const result = await pullCalendarBlocks(conn.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function deleteCalendarConnectionHandler(req, res, next) {
  try {
    const conn = await prisma.calendarConnection.findFirst({
      where: { id: req.params.connectionId, businessId: tenant(req) },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    await prisma.calendarConnection.update({
      where: { id: conn.id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

// ─── Availability rules (RRULE) ───
export async function listAvailabilityRules(req, res, next) {
  try {
    const staffId = req.params.staffId;
    const rows = await prisma.staffAvailabilityRule.findMany({
      where: { businessId: tenant(req), staffId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createAvailabilityRule(req, res, next) {
  try {
    const staffId = req.params.staffId;
    const b = req.body || {};
    const rrule = b.preset ? presetToRrule(b.preset) : b.rrule;
    if (!rrule) return res.status(400).json({ error: 'rrule or preset required' });

    const staff = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: tenant(req), deletedAt: null },
    });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const row = await prisma.staffAvailabilityRule.create({
      data: {
        businessId: tenant(req),
        staffId,
        locationId: b.locationId || null,
        ruleType: b.ruleType || 'AVAILABLE',
        rrule: String(rrule),
        startTime: b.startTime || '09:00',
        endTime: b.endTime || '18:00',
        timezone: b.timezone || 'Asia/Kolkata',
        validFrom: b.validFrom ? new Date(b.validFrom) : null,
        validUntil: b.validUntil ? new Date(b.validUntil) : null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteAvailabilityRule(req, res, next) {
  try {
    const row = await prisma.staffAvailabilityRule.findFirst({
      where: { id: req.params.ruleId, businessId: tenant(req) },
    });
    if (!row) return res.status(404).json({ error: 'Rule not found' });
    await prisma.staffAvailabilityRule.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

// ─── Appointment payments ───
export async function createPaymentIntentHandler(req, res, next) {
  try {
    const b = req.body || {};
    const result = await createAppointmentPaymentIntent({
      businessId: tenant(req),
      appointmentId: req.params.id,
      advancePercent: b.advancePercent,
      mode: b.mode || 'advance',
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function listAppointmentPayments(req, res, next) {
  try {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: tenant(req) },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const rows = await prisma.appointmentPayment.findMany({
      where: { appointmentId: appt.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createPaymentQrHandler(req, res, next) {
  try {
    const b = req.body || {};
    const result = await createAppointmentPaymentIntent({
      businessId: tenant(req),
      appointmentId: req.params.id,
      advancePercent: b.advancePercent,
      mode: b.mode || 'advance',
    });
    const qrDataUrl = await QRCode.toDataURL(result.paymentLinkUrl);
    res.json({ ...result, qrDataUrl });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function getCustomerStatsHandler(req, res, next) {
  try {
    const row = await getCustomerAppointmentStats(tenant(req), req.params.customerId);
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function triggerRebookingCampaign(req, res, next) {
  try {
    const limit = Number(req.body?.limit) || 10;
    const result = await sendRebookingCampaign(tenant(req), { limit });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function googleCalendarWebhook(req, res) {
  res.status(200).send('');
  try {
    await handleGoogleCalendarWebhook(req.headers);
  } catch {
    // Google expects 200 quickly
  }
}

export async function outlookCalendarWebhook(req, res) {
  try {
    const result = await handleOutlookCalendarWebhook(req);
    if (result?.validation) {
      return res.status(200).contentType('text/plain').send(result.validation);
    }
    return res.status(202).send();
  } catch {
    return res.status(202).send();
  }
}
