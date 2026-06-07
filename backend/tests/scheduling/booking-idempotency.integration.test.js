import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { createAppointment } from '../../src/scheduling/appointment.service.js';
import { withBookingIdempotency } from '../../src/scheduling/idempotency.service.js';
import {
  createSchedulingTestTenant,
  destroySchedulingTestTenant,
  pickBookableSlot,
} from './helpers/fixtures.js';

const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);

describe('booking idempotency integration', { skip: !hasDatabase }, () => {
  /** @type {{ business: object, customer: object, location: object, staff: object, service: object }} */
  let ctx;
  /** @type {string[]} */
  let bookedStartAts = [];

  before(async () => {
    ctx = await createSchedulingTestTenant();
  });

  after(async () => {
    if (ctx?.business?.id) {
      await destroySchedulingTestTenant(ctx.business.id);
    }
    await prisma.$disconnect();
  });

  it('creates only one appointment when the same idempotency key is reused', async () => {
    const slot = await pickBookableSlot({
      businessId: ctx.business.id,
      serviceId: ctx.service.id,
      locationId: ctx.location.id,
      staffId: ctx.staff.id,
      excludeStartAts: bookedStartAts,
    });
    const idempotencyKey = `test-${Date.now()}-idem`;

    const bookingArgs = {
      businessId: ctx.business.id,
      customerId: ctx.customer.id,
      staffId: slot.staffId,
      serviceId: ctx.service.id,
      locationId: slot.locationId,
      startAt: slot.startAt,
      source: 'DASHBOARD',
      status: 'CONFIRMED',
    };

    const first = await withBookingIdempotency({
      businessId: ctx.business.id,
      idempotencyKey,
      run: () => createAppointment(bookingArgs),
    });
    assert.equal(first.replayed, false);
    assert.ok(first.appointment?.id);

    const second = await withBookingIdempotency({
      businessId: ctx.business.id,
      idempotencyKey,
      run: () => createAppointment(bookingArgs),
    });
    assert.equal(second.replayed, true);
    assert.equal(second.appointment.id, first.appointment.id);

    const count = await prisma.appointment.count({
      where: {
        businessId: ctx.business.id,
        customerId: ctx.customer.id,
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
      },
    });
    assert.equal(count, 1);
    bookedStartAts.push(slot.startAt);
  });

  it('creates separate appointments when idempotency keys differ', async () => {
    const slot1 = await pickBookableSlot({
      businessId: ctx.business.id,
      serviceId: ctx.service.id,
      locationId: ctx.location.id,
      staffId: ctx.staff.id,
      excludeStartAts: bookedStartAts,
    });
    const slot2 = await pickBookableSlot({
      businessId: ctx.business.id,
      serviceId: ctx.service.id,
      locationId: ctx.location.id,
      staffId: ctx.staff.id,
      excludeStartAts: [...bookedStartAts, slot1.startAt],
    });

    const first = await withBookingIdempotency({
      businessId: ctx.business.id,
      idempotencyKey: `test-${Date.now()}-a`,
      run: () =>
        createAppointment({
          businessId: ctx.business.id,
          customerId: ctx.customer.id,
          staffId: slot1.staffId,
          serviceId: ctx.service.id,
          locationId: slot1.locationId,
          startAt: slot1.startAt,
          status: 'CONFIRMED',
        }),
    });

    const second = await withBookingIdempotency({
      businessId: ctx.business.id,
      idempotencyKey: `test-${Date.now()}-b`,
      run: () =>
        createAppointment({
          businessId: ctx.business.id,
          customerId: ctx.customer.id,
          staffId: slot2.staffId,
          serviceId: ctx.service.id,
          locationId: slot2.locationId,
          startAt: slot2.startAt,
          status: 'CONFIRMED',
        }),
    });

    assert.notEqual(first.appointment.id, second.appointment.id);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, false);
    bookedStartAts.push(slot1.startAt, slot2.startAt);
  });

  it('books without an idempotency key when key is missing', async () => {
    const slot = await pickBookableSlot({
      businessId: ctx.business.id,
      serviceId: ctx.service.id,
      locationId: ctx.location.id,
      staffId: ctx.staff.id,
      excludeStartAts: bookedStartAts,
    });

    const result = await withBookingIdempotency({
      businessId: ctx.business.id,
      idempotencyKey: '',
      run: () =>
        createAppointment({
          businessId: ctx.business.id,
          customerId: ctx.customer.id,
          staffId: slot.staffId,
          serviceId: ctx.service.id,
          locationId: slot.locationId,
          startAt: slot.startAt,
          status: 'CONFIRMED',
        }),
    });

    assert.equal(result.replayed, false);
    assert.ok(result.appointment?.id);
  });
});
