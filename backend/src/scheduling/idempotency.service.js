import { prisma } from '../lib/prisma.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 400;
const MAX_POLLS = 15;

function normalizeKey(key) {
  const k = String(key || '').trim();
  if (!k || k.length > 128) return null;
  return k;
}

/** @internal Exported for unit tests */
export function normalizeIdempotencyKey(key) {
  return normalizeKey(key);
}

async function loadAppointment(businessId, appointmentId, include) {
  if (!appointmentId) return null;
  return prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include,
  });
}

async function waitForCompleted(businessId, idempotencyKey, include) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const row = await prisma.bookingIdempotencyKey.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
    });
    if (row?.status === 'COMPLETED' && row.appointmentId) {
      const appointment = await loadAppointment(businessId, row.appointmentId, include);
      if (appointment) return { appointment, replayed: true };
    }
    if (row?.status === 'FAILED') break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return null;
}

/**
 * Run a booking operation once per idempotency key per tenant.
 * @param {{ businessId: string, idempotencyKey?: string, include?: object, run: () => Promise<{ appointment: object, paymentIntent?: object }> }} args
 */
export async function withBookingIdempotency({ businessId, idempotencyKey, include, run }) {
  const key = normalizeKey(idempotencyKey);
  if (!key) return { ...(await run()), replayed: false };

  const existing = await prisma.bookingIdempotencyKey.findUnique({
    where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
  });

  if (existing?.status === 'COMPLETED' && existing.appointmentId) {
    const appointment = await loadAppointment(businessId, existing.appointmentId, include);
    if (appointment) {
      return { appointment, paymentIntent: null, replayed: true };
    }
  }

  if (existing?.status === 'IN_PROGRESS') {
    const waited = await waitForCompleted(businessId, key, include);
    if (waited) return { ...waited, paymentIntent: null };
    const err = new Error('Booking in progress — retry with the same Idempotency-Key');
    err.statusCode = 409;
    err.code = 'IDEMPOTENCY_IN_PROGRESS';
    throw err;
  }

  let recordId;
  try {
    const created = await prisma.bookingIdempotencyKey.create({
      data: {
        businessId,
        idempotencyKey: key,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
    recordId = created.id;
  } catch (e) {
    if (e.code === 'P2002') {
      const waited = await waitForCompleted(businessId, key, include);
      if (waited) return { ...waited, paymentIntent: null };
    }
    throw e;
  }

  try {
    const result = await run();
    await prisma.bookingIdempotencyKey.update({
      where: { id: recordId },
      data: {
        status: 'COMPLETED',
        appointmentId: result.appointment.id,
      },
    });
    return { ...result, replayed: false };
  } catch (e) {
    await prisma.bookingIdempotencyKey.update({
      where: { id: recordId },
      data: { status: 'FAILED' },
    }).catch(() => {});
    await prisma.bookingIdempotencyKey.delete({ where: { id: recordId } }).catch(() => {});
    throw e;
  }
}

export async function purgeExpiredIdempotencyKeys() {
  await prisma.bookingIdempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
