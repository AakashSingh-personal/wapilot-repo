import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppointment } from '../../src/scheduling/appointment.service.js';
import {
  createSchedulingTestTenant,
  destroySchedulingTestTenant,
  pickBookableSlot,
} from './helpers/fixtures.js';

/** Use LOAD_TEST_CONCURRENCY=100 with DATABASE_CONNECTION_LIMIT>=10 for full load test. */
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY || 25);

test('concurrent bookings: only one succeeds per slot without idempotency key', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL required');
    return;
  }

  const { business, customer, location, staff, service } = await createSchedulingTestTenant();
  t.after(async () => destroySchedulingTestTenant(business.id));

  const slot = await pickBookableSlot({
    businessId: business.id,
    serviceId: service.id,
    locationId: location.id,
    staffId: staff.id,
  });

  const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
    createAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: service.id,
      locationId: location.id,
      staffId: staff.id,
      startAt: slot.startAt,
      source: 'LOAD_TEST',
      idempotencyKey: `load-${business.id}-${i}`,
    }).then(
      (row) => ({ ok: true, id: row.id }),
      (err) => ({ ok: false, code: err.code || err.message }),
    ),
  );

  const results = await Promise.all(attempts);
  const successes = results.filter((r) => r.ok);
  const failures = results.filter((r) => !r.ok);

  assert.equal(successes.length, 1, `expected exactly 1 booking, got ${successes.length}`);
  assert.equal(
    failures.length,
    CONCURRENCY - 1,
    `expected ${CONCURRENCY - 1} failed attempts, got ${failures.length}`,
  );
});
