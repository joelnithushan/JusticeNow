/**
 * Integration tests — JNOW-36 refer/assign a case to an organisation.
 *
 * Follows the fetch-stub + real-JWT pattern in caseDetail.test.js:
 *   - stub global fetch BEFORE importing app.js
 *   - sign JWTs with process.env.JWT_SECRET (role + organisation_id claims)
 *   - canned case_reports / organisations / audit_log responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { signStaffToken } from '../../utils/staffJwt.js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';

const JWT_SECRET = process.env.JWT_SECRET;

// Case already sitting with org-1 — in-scope for an org-1 officer.
const CASE_IN_ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// Case belonging to another org — out of scope for org-1 staff.
const CASE_OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ACTIVE_ORG = 'org-active';
const INACTIVE_ORG = 'org-inactive';
const MISSING_ORG = 'org-missing';

let lastCasePatch = null;
let lastAuditInsert = null;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function caseRow(id, assignedOrgId) {
  return {
    id,
    assigned_org_id: assignedOrgId,
    status: 'under_review',
    updated_at: '2026-03-01T12:00:00.000Z',
  };
}

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = (options.method || 'GET').toUpperCase();

  // ---- case_reports: GET (load) / PATCH (assign) ----
  if (target.includes('/rest/v1/case_reports')) {
    if (method === 'PATCH') {
      lastCasePatch = options.body ? JSON.parse(options.body) : null;
      // Echo the id from the URL filter so the controller gets a row back.
      const idMatch = target.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      const id = idMatch ? idMatch[0] : CASE_IN_ORG;
      return json([
        {
          id,
          assigned_org_id: lastCasePatch.assigned_org_id,
          status: 'under_review',
          updated_at: lastCasePatch.updated_at || '2026-03-01T12:00:00.000Z',
        },
      ]);
    }

    if (target.includes(CASE_IN_ORG)) return json([caseRow(CASE_IN_ORG, 'org-1')]);
    if (target.includes(CASE_OTHER_ORG)) return json([caseRow(CASE_OTHER_ORG, 'org-2')]);
    return json([]);
  }

  // ---- organisations: active / inactive / missing ----
  if (target.includes('/rest/v1/organisations')) {
    if (target.includes(ACTIVE_ORG)) {
      return json([{ id: ACTIVE_ORG, is_active: true }]);
    }
    if (target.includes(INACTIVE_ORG)) {
      return json([{ id: INACTIVE_ORG, is_active: false }]);
    }
    // Nonexistent org → empty list (maybeSingle → null).
    return json([]);
  }

  // ---- audit_log insert ----
  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    lastAuditInsert = options.body ? JSON.parse(options.body) : null;
    const row = Array.isArray(lastAuditInsert) ? lastAuditInsert[0] : lastAuditInsert;
    return json([{ id: 'audit-1', ...row }], 201);
  }

  if (target.includes('/auth/v1/user')) {
    return json({ msg: 'invalid token' }, 401);
  }

  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

function staffAuth(req, { role, organisation_id, sub = 'staff-1' }) {
  const token = signStaffToken(
    {
      sub,
      email: `${role}@example.org`,
      role,
      organisation_id,
    },
    JWT_SECRET,
  );
  return req.set('Authorization', `Bearer ${token}`);
}

beforeEach(() => {
  lastCasePatch = null;
  lastAuditInsert = null;
  fetchMock.mockClear();
});

describe('PATCH /api/reports/:id/assign (JNOW-36)', () => {
  it('assigns to an active org (200) and writes a case_assigned audit', async () => {
    const res = await staffAuth(
      request(app).patch(`/api/reports/${CASE_IN_ORG}/assign`),
      { role: 'officer', organisation_id: 'org-1' },
    ).send({ assigned_org_id: ACTIVE_ORG });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned_org_id).toBe(ACTIVE_ORG);
    expect(lastCasePatch.assigned_org_id).toBe(ACTIVE_ORG);

    const audit = Array.isArray(lastAuditInsert) ? lastAuditInsert[0] : lastAuditInsert;
    expect(audit).toBeTruthy();
    expect(audit.action).toBe('case_assigned');
    expect(audit.detail).toEqual({ assigned_org_id: ACTIVE_ORG });
    expect(audit.case_id).toBe(CASE_IN_ORG);
  });

  it('rejects an inactive organisation with 400 and writes no audit', async () => {
    const res = await staffAuth(
      request(app).patch(`/api/reports/${CASE_IN_ORG}/assign`),
      { role: 'officer', organisation_id: 'org-1' },
    ).send({ assigned_org_id: INACTIVE_ORG });

    expect(res.status).toBe(400);
    expect(lastCasePatch).toBeNull();
    expect(lastAuditInsert).toBeNull();
  });

  it('rejects a nonexistent organisation with 400 and writes no audit', async () => {
    const res = await staffAuth(
      request(app).patch(`/api/reports/${CASE_IN_ORG}/assign`),
      { role: 'org_admin', organisation_id: 'org-1' },
    ).send({ assigned_org_id: MISSING_ORG });

    expect(res.status).toBe(400);
    expect(lastCasePatch).toBeNull();
    expect(lastAuditInsert).toBeNull();
  });

  describe('ORG-SCOPING', () => {
    it('returns a generic 404 when an officer assigns a case outside their org', async () => {
      const res = await staffAuth(
        request(app).patch(`/api/reports/${CASE_OTHER_ORG}/assign`),
        { role: 'officer', organisation_id: 'org-1' },
      ).send({ assigned_org_id: ACTIVE_ORG });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Case not found.');
      expect(lastCasePatch).toBeNull();
      expect(lastAuditInsert).toBeNull();
    });

    it('returns a generic 404 when an org_admin assigns a case outside their org', async () => {
      const res = await staffAuth(
        request(app).patch(`/api/reports/${CASE_OTHER_ORG}/assign`),
        { role: 'org_admin', organisation_id: 'org-1' },
      ).send({ assigned_org_id: ACTIVE_ORG });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Case not found.');
      expect(lastAuditInsert).toBeNull();
    });

    it('lets a platform admin assign a case in any organisation', async () => {
      const res = await staffAuth(
        request(app).patch(`/api/reports/${CASE_OTHER_ORG}/assign`),
        { role: 'admin', organisation_id: null, sub: 'platform-admin' },
      ).send({ assigned_org_id: ACTIVE_ORG });

      expect(res.status).toBe(200);
      expect(res.body.data.assigned_org_id).toBe(ACTIVE_ORG);

      const audit = Array.isArray(lastAuditInsert) ? lastAuditInsert[0] : lastAuditInsert;
      expect(audit.action).toBe('case_assigned');
      expect(audit.detail).toEqual({ assigned_org_id: ACTIVE_ORG });
    });
  });
});
