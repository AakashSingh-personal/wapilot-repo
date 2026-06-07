import { prisma } from '../lib/prisma.js';
import { parseCatalog } from '../utils/businessCatalog.js';
import { getCustomerAppointmentStats } from '../scheduling/customerStats.service.js';

/**
 * Maps dotted / namespaced keys from templates to canonical snake_case keys.
 * @type {Readonly<Record<string, string>>}
 */
export const ENGINE_KEY_ALIASES = Object.freeze({
  'customer.name': 'customer_name',
  'customer.phone': 'customer_phone',
  'customer.email': 'customer_email',
  'business.name': 'business_name',
  'business.owner_name': 'business_owner_name',
  'business.support_number': 'business_support_number',
  'business.phone': 'business_phone',
  'appointment.current.date': 'current_appointment_date',
  'appointment.current.time': 'current_appointment_time',
  'appointment.current.service_name': 'current_service_name',
  'appointment.current.staff_name': 'current_staff_name',
  'appointment.current.booking_id': 'current_booking_id',
  'appointment.current.booking_status': 'current_booking_status',
  'appointment.current.booking_amount': 'current_booking_amount',
  'appointment.last.date': 'last_appointment_date',
  'appointment.last.service_name': 'last_service_name',
  'appointment.last.staff_name': 'last_staff_name',
  'appointment.last.booking_amount': 'last_booking_amount',
  'appointment.next.date': 'next_appointment_date',
  'appointment.next.service_name': 'next_service_name',
  'payment.last.amount': 'last_payment_amount',
  'payment.last.date': 'last_payment_date',
  'payment.customer.total_paid': 'total_amount_paid',
  'payment.pending.amount': 'pending_amount',
  'payment.status': 'payment_status',
  'payment.method': 'payment_method',
  'business.wallet.balance': 'wallet_balance',
  'business.wallet.total_spent': 'total_wallet_spent',
  'business.subscription.plan': 'current_plan',
  'business.subscription.expiry': 'subscription_expiry',
  'business.wallet.last_recharge': 'last_recharge_amount',
});

/** Every canonical key the engine may populate (also blocks custom field keys with same id). */
export const ALL_ENGINE_KEYS = [
  'name',
  'phone',
  'customer_name',
  'customer_phone',
  'customer_email',
  'business_name',
  'business_phone',
  'business_owner_name',
  'owner_name',
  'business_support_number',
  'support_number',
  'current_date',
  'current_time',
  'current_appointment_date',
  'current_appointment_time',
  'current_appointment_id',
  'current_appointment_status',
  'current_appointment_staff',
  'current_service_name',
  'current_staff_name',
  'appointment_amount',
  'amount_paid',
  'amount_due',
  'staff_name',
  'staff_designation',
  'staff_email',
  'staff_phone',
  'current_booking_id',
  'current_booking_status',
  'current_booking_amount',
  'last_appointment_date',
  'last_appointment_staff',
  'last_appointment_service',
  'last_service_name',
  'last_staff_name',
  'last_booking_amount',
  'next_appointment_date',
  'next_appointment_time',
  'next_appointment_staff',
  'next_service_name',
  'last_payment_amount',
  'last_payment_date',
  'total_amount_paid',
  'pending_amount',
  'payment_status',
  'payment_method',
  'wallet_balance',
  'total_wallet_spent',
  'current_plan',
  'subscription_expiry',
  'last_recharge_amount',
];

export const RESERVED_ENGINE_KEYS = new Set(ALL_ENGINE_KEYS);

export function canonicalizeVariableKey(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const dotKey = trimmed.toLowerCase().replace(/\s+/g, '');
  if (ENGINE_KEY_ALIASES[dotKey]) return ENGINE_KEY_ALIASES[dotKey];
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/\.+/g, '_')
    .replace(/_+/g, '_');
}

function formatDisplayDate(d) {
  try {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatShortDate(d) {
  try {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function formatDisplayTime(d) {
  try {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ownerNameFromUser(owner) {
  const email = owner?.email || '';
  const at = email.indexOf('@');
  return (at > 0 ? email.slice(0, at) : email).trim() || email;
}

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return x.toFixed(2).replace(/\.?0+$/, '');
}

function formatBookingRef(id) {
  if (!id) return '';
  const hex = String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
  return hex ? `BK${hex}` : '';
}

function planLabel(plan) {
  if (plan === 'BASIC') return 'Basic';
  if (plan === 'PRO') return 'Pro';
  return String(plan || '').trim();
}

function emptyContext() {
  return Object.fromEntries(ALL_ENGINE_KEYS.map((k) => [k, '']));
}

/**
 * Builds flat template variable values for one business (+ optional customer / contact).
 * Used by {@link resolvePersonalizedTemplateText} and can be exposed for previews / APIs.
 */
export async function buildTemplateContext({
  businessId,
  customerId = null,
  contactName = null,
  contactPhone = null,
  now = new Date(),
}) {
  const ctx = emptyContext();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { config: true },
  });
  const owner =
    business?.ownerId &&
    (await prisma.user.findFirst({
      where: { id: business.ownerId },
      select: { email: true },
    }));

  const [wallet, spendAgg, lastTopup, subscription, bookings, appointments, payments] = await Promise.all([
    prisma.wallet.findUnique({ where: { businessId } }),
    prisma.walletTransaction.aggregate({
      where: { businessId, type: 'DEBIT' },
      _sum: { amount: true },
    }),
    prisma.payment.findFirst({
      where: { businessId, type: 'WALLET_TOPUP', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    }),
    customerId
      ? prisma.booking.findMany({
          where: { customerId, businessId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
    customerId
      ? prisma.appointment.findMany({
          where: { customerId, businessId },
          include: { staff: true, service: true, location: true },
          orderBy: { startAt: 'desc' },
          take: 20,
        })
      : [],
    customerId
      ? prisma.customerPayment.findMany({
          where: { customerId, businessId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
  ]);

  const catalog = parseCatalog(business?.config?.services);
  const clientProfile = catalog.clientProfile || {};

  const customer = customerId
    ? await prisma.customer.findFirst({
        where: { id: customerId, businessId },
      })
    : null;

  ctx.customer_name = String(customer?.name || contactName || '').trim();
  ctx.name = ctx.customer_name;
  ctx.customer_phone = String(customer?.phone || contactPhone || '').trim();
  ctx.phone = ctx.customer_phone;
  ctx.customer_email = String(customer?.email || '').trim();

  ctx.business_name = String(clientProfile.business_name || business?.name || '').trim();
  ctx.business_phone = String(clientProfile.business_phone || process.env.BUSINESS_DISPLAY_PHONE || '').trim();
  ctx.business_owner_name = String(clientProfile.business_owner_name || ownerNameFromUser(owner)).trim();
  ctx.owner_name = ctx.business_owner_name;
  ctx.business_support_number = String(clientProfile.business_support_number || process.env.SUPPORT_PHONE || '').trim();
  ctx.support_number = ctx.business_support_number;

  ctx.current_date = formatDisplayDate(now);
  ctx.current_time = formatDisplayTime(now);

  ctx.wallet_balance = formatMoney(wallet?.balance ?? 0);
  ctx.total_wallet_spent = formatMoney(spendAgg?._sum?.amount ?? 0);
  ctx.last_recharge_amount = lastTopup ? formatMoney(lastTopup.amount) : '';
  ctx.current_plan = subscription ? planLabel(subscription.plan) : '';
  ctx.subscription_expiry = subscription?.expiresAt ? formatDisplayDate(subscription.expiresAt) : '';

  const apptUpcoming = (appointments || []).filter((a) =>
    ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(a.status) && new Date(a.startAt) >= now,
  );
  const apptPast = (appointments || []).filter((a) =>
    ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status) || new Date(a.startAt) < now,
  );
  const curAppt = apptUpcoming[0] || appointments?.[0] || null;
  const prevAppt = apptPast.find((a) => a.status === 'COMPLETED') || apptPast[0] || null;
  const nextAppt = apptUpcoming[1] || apptUpcoming[0] || null;

  const confirmed = (bookings || []).filter((b) => b.status === 'CONFIRMED');
  const pending = (bookings || []).filter((b) => b.status === 'PENDING');
  const cur = curAppt || confirmed[0] || null;
  const prev = prevAppt || confirmed[1] || null;
  const nextP = nextAppt || (pending.length
    ? [...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]
    : null);

  if (cur) {
    if (cur.startAt) {
      ctx.current_appointment_id = cur.appointmentNumber || formatBookingRef(cur.id);
      ctx.current_appointment_date = formatDisplayDate(cur.startAt);
      ctx.current_appointment_time = formatDisplayTime(cur.startAt);
      ctx.current_appointment_status = String(cur.status || '');
      ctx.current_appointment_staff = String(cur.staff?.name || '');
      ctx.current_service_name = String(cur.service?.name || cur.service || '').trim();
      ctx.current_staff_name = ctx.current_appointment_staff;
      ctx.appointment_amount = formatMoney(cur.amount);
      ctx.amount_paid = formatMoney(cur.amountPaid);
      ctx.amount_due = formatMoney(cur.amountDue);
      ctx.payment_status = String(cur.paymentStatus || '');
      ctx.staff_name = ctx.current_appointment_staff;
      ctx.staff_designation = String(cur.staff?.designation || '');
      ctx.staff_email = String(cur.staff?.email || '');
      ctx.staff_phone = String(cur.staff?.mobile || '');
    } else {
      ctx.current_appointment_date = formatDisplayDate(cur.createdAt);
      ctx.current_appointment_time = String(cur.slot || '').trim() || formatDisplayTime(cur.createdAt);
      ctx.current_service_name = String(cur.service || '').trim();
      ctx.current_staff_name = '';
      ctx.current_booking_id = formatBookingRef(cur.id);
      ctx.current_booking_status = String(cur.status || '');
      ctx.current_booking_amount = '';
    }
  }
  if (prev) {
    if (prev.startAt) {
      ctx.last_appointment_date = formatDisplayDate(prev.startAt);
      ctx.last_appointment_staff = String(prev.staff?.name || '');
      ctx.last_appointment_service = String(prev.service?.name || '');
      ctx.last_service_name = ctx.last_appointment_service;
      ctx.last_staff_name = ctx.last_appointment_staff;
    } else {
      ctx.last_appointment_date = formatDisplayDate(prev.createdAt);
      ctx.last_service_name = String(prev.service || '').trim();
      ctx.last_staff_name = '';
      ctx.last_booking_amount = '';
    }
  }
  if (nextP) {
    if (nextP.startAt) {
      ctx.next_appointment_date = formatDisplayDate(nextP.startAt);
      ctx.next_appointment_time = formatDisplayTime(nextP.startAt);
      ctx.next_appointment_staff = String(nextP.staff?.name || '');
      ctx.next_service_name = String(nextP.service?.name || '');
    } else {
      ctx.next_appointment_date = formatDisplayDate(nextP.createdAt);
      ctx.next_service_name = String(nextP.service || '').trim();
    }
  }

  if (payments?.length) {
    const latest = payments[0];
    ctx.last_payment_amount = formatMoney(latest.amount);
    ctx.last_payment_date = formatShortDate(latest.createdAt);
    ctx.payment_status = String(latest.status || '');
    ctx.payment_method = String(latest.provider || '').trim();

    let paidSum = 0;
    let pendingSum = 0;
    for (const p of payments) {
      const a = Number(p.amount) || 0;
      if (p.status === 'PAID') paidSum += a;
      if (p.status === 'PENDING') pendingSum += a;
    }
    ctx.total_amount_paid = formatMoney(paidSum);
    ctx.pending_amount = formatMoney(pendingSum);
  }

  if (customerId) {
    try {
      const stats = await getCustomerAppointmentStats(businessId, customerId);
      if (stats) {
        ctx.total_visits = String(stats.totalVisits);
        ctx.lifetime_spend = formatMoney(stats.lifetimeSpend);
        ctx.customer_avg_rating = stats.avgRating != null ? String(stats.avgRating) : '';
      }
    } catch {
      // Stats are optional
    }
  }

  return ctx;
}
