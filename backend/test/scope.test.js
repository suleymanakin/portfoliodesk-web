import test from 'node:test';
import assert from 'node:assert/strict';
import { requireInvestorScopeFromParam, requireInvestorScopeFromQuery } from '../src/middleware/scope.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('requireInvestorScopeFromParam allows admin', async () => {
  const mw = requireInvestorScopeFromParam('id');
  const req = { user: { role: 'admin' }, params: { id: '999' } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
});

test('requireInvestorScopeFromParam blocks investor mismatch', async () => {
  const mw = requireInvestorScopeFromParam('id');
  const req = { user: { role: 'investor', investorId: 10 }, params: { id: '11' } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('requireInvestorScopeFromQuery blocks missing investorId', async () => {
  const mw = requireInvestorScopeFromQuery('investorId');
  const req = { user: { role: 'investor', investorId: 10 }, query: {} };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

