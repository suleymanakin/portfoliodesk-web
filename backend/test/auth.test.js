import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../src/middleware/auth.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('requireAdmin allows admin', async () => {
  const req = { user: { role: 'admin' } };
  const res = mockRes();
  let called = false;
  requireAdmin(req, res, () => { called = true; });
  assert.equal(called, true);
});

test('requireAdmin blocks non-admin', async () => {
  const req = { user: { role: 'investor' } };
  const res = mockRes();
  let called = false;
  requireAdmin(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

