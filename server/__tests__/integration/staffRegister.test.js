/**
 * Integration tests — /api/staff/register PUBLIC self-service signup.
 *
 * Same fetch-stub pattern as staffAdmin.test.js (no real DB; stub installed
 * BEFORE the app import). This is a PUBLIC endpoint (no token). We pin the
 * security-critical properties of self-signup:
 *   - a valid signup creates a PENDING account: the insert body carries
 *     is_active=false and profile_completed=false, and a bcrypt HASH (never the
 *     plaintext password);
 *   - role 'admin' is refused (platform admin is never self-registerable);
 *   - a duplicate email (Postgres 23505) is a friendly 400, not a 500;
 *   - a too-short password is a 400 (server is the authority).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

let orgLookupRow = { id: 'org-1' }; // org existence check (null = missing)
let mutatedRow = null; // the created row insert().select().single() returns
let insertBody = null; // captures the staff_users POST body
let insertError = null; // when set, the staff_users POST returns this error
let auditBodies = [];

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  if (method === 'POST' && target.includes('/rest/v1/audit_log')) {
    const parsed = options.body ? JSON.parse(options.body) : null;
    auditBodies.push(Array.isArray(parsed) ? parsed[0] : parsed);
    return json([], 201);
  }
  if (target.includes('/rest/v1/organisations')) {
    return json(orgLookupRow); // id=eq.<id>.maybeSingle()
  }
  if (target.includes('/rest/v1/staff_users')) {
    if (method === 'POST') {
      insertBody = options.body ? JSON.parse(options.body) : null;
      if (insertError) return json(insertError, 400);
      return json(mutatedRow);
    }
    return json([]);
  }
  return json([], 200);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

const validBody = {
  name: 'New Officer',
  email: 'new.officer@example.org',
  password: 'Password123',
  role: 'officer',
  organisation_id: 'org-1',
};

beforeEach(() => {
  orgLookupRow = { id: 'org-1' };
  mutatedRow = {
    id: 'staff-new-1',
    name: 'New Officer',
    email: 'new.officer@example.org',
    role: 'officer',
    organisation_id: 'org-1',
    is_active: false,
  };
  insertBody = null;
  insertError = null;
  auditBodies = [];
  fetchMock.mockClear();
});

describe('POST /api/staff/register — self-service signup (pending approval)', () => {
  it('creates a PENDING account: inactive, profile incomplete, hashed password', async () => {
    const res = await request(app).post('/api/staff/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe('string');

    // The stored row must be inactive and profile-incomplete (the gate).
    expect(insertBody.is_active).toBe(false);
    expect(insertBody.profile_completed).toBe(false);

    // A genuine bcrypt hash was stored, NEVER the plaintext.
    expect(insertBody.password_hash).toBeTruthy();
    expect(insertBody.password_hash).not.toBe(validBody.password);
    expect(bcrypt.compareSync(validBody.password, insertBody.password_hash)).toBe(true);
    expect(insertBody.password).toBeUndefined();
  });

  it("refuses the platform 'admin' role (never self-registerable)", async () => {
    const res = await request(app)
      .post('/api/staff/register')
      .send({ ...validBody, role: 'admin' });

    expect(res.status).toBe(400);
    expect(insertBody).toBeNull(); // rejected before any DB write
  });

  it('maps a duplicate email (23505) to a friendly 400', async () => {
    insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = await request(app).post('/api/staff/register').send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });

  it('rejects a too-short password with 400', async () => {
    const res = await request(app)
      .post('/api/staff/register')
      .send({ ...validBody, password: 'short' });

    expect(res.status).toBe(400);
    expect(insertBody).toBeNull();
  });
});
