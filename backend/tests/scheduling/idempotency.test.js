import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdempotencyKey } from '../../src/scheduling/idempotency.service.js';

describe('normalizeIdempotencyKey', () => {
  it('returns trimmed key when valid', () => {
    assert.equal(normalizeIdempotencyKey('  abc-123  '), 'abc-123');
  });

  it('rejects empty and whitespace-only keys', () => {
    assert.equal(normalizeIdempotencyKey(''), null);
    assert.equal(normalizeIdempotencyKey('   '), null);
    assert.equal(normalizeIdempotencyKey(null), null);
    assert.equal(normalizeIdempotencyKey(undefined), null);
  });

  it('rejects keys longer than 128 characters', () => {
    assert.equal(normalizeIdempotencyKey('x'.repeat(129)), null);
    assert.equal(normalizeIdempotencyKey('x'.repeat(128)), 'x'.repeat(128));
  });
});
