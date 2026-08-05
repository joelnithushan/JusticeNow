/**
 * Community Hazard Alert & Response System - API Test Suite
 * Team: SPM_NU_WE_01
 *
 * Integration tests: every request goes through the real Express app
 * (app.js) and the real Supabase database.
 *
 * Run with: npm test   (from the /server folder)
 *
 * Test data uses unique emails per run (test_<timestamp>@example.lk) and
 * is deleted in afterAll - deleting the test user cascades to their
 * hazard reports and SOS rows (ON DELETE CASCADE).
 */

const request = require('supertest');
const app = require('../app');
const supabase = require('../config/supabase');

// Unique per test run so repeated runs never collide
const RUN_ID = Date.now();
const TEST_EMAIL = `test_${RUN_ID}@example.lk`;
const TEST_PASSWORD = 'TestPass123!';

// Filled in by earlier tests, used by later ones
let testUserId = null;
let createdSosId = null;

afterAll(async () => {
  // Cascade-deletes the test user's hazard reports and SOS rows too
  await supabase.from('users').delete().like('email', `test_${RUN_ID}%`);
});

// =========================================================================
// TC-01: General API
// =========================================================================
describe('General API', () => {
  test('TC-01-01: GET / returns welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.group).toBe('SPM_NU_WE_01');
  });

  test('TC-01-02: unknown route returns 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('TC-01-03: GET /api/health confirms database connection', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(typeof res.body.userCount).toBe('number');
  });
});

// =========================================================================
// TC-02: Authentication - Registration
// =========================================================================
describe('POST /api/auth/register', () => {
  test('TC-02-01: rejects registration with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD }); // no name/district
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('TC-02-02: registers a new user successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      district: 'Colombo',
      ds_division: 'Thimbirigasyaya'
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.id).toBeDefined();
    testUserId = res.body.user.id;
  });

  test('TC-02-03: never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User 2',
      email: `test_${RUN_ID}_b@example.lk`,
      password: TEST_PASSWORD,
      district: 'Kandy',
      ds_division: 'Gangawata Korale'
    });
    expect(res.status).toBe(201);
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test('TC-02-04: rejects duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate User',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      district: 'Galle',
      ds_division: 'Four Gravets'
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// =========================================================================
// TC-03: Authentication - Login
// =========================================================================
describe('POST /api/auth/login', () => {
  test('TC-03-01: rejects login with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL });
    expect(res.status).toBe(400);
  });

  test('TC-03-02: rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPassword!' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('TC-03-03: rejects login for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `nobody_${RUN_ID}@example.lk`, password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  test('TC-03-04: logs in with correct credentials (bcrypt verified)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('TC-03-05: seeded demo account can log in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'joel@example.lk', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.user.district).toBe('Colombo');
  });
});

// =========================================================================
// TC-04: Hazard Reports
// =========================================================================
describe('Hazard Reports API', () => {
  test('TC-04-01: GET /api/hazards returns reports newest-first', async () => {
    const res = await request(app).get('/api/hazards');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    // newest-first ordering
    const times = res.body.data.map((r) => new Date(r.created_at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('TC-04-02: rejects report with missing required fields', async () => {
    const res = await request(app)
      .post('/api/hazards')
      .send({ type: 'flood', latitude: 6.9 }); // missing longitude/severity
    expect(res.status).toBe(400);
  });

  test('TC-04-03: rejects report without reporter_id', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'flood',
      latitude: 6.9,
      longitude: 79.8,
      severity: 'high'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reporter_id/);
  });

  test('TC-04-04: rejects invalid hazard type', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'tsunami',
      latitude: 6.9,
      longitude: 79.8,
      severity: 'high',
      reporter_id: testUserId
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid hazard type/);
  });

  test('TC-04-05: rejects invalid severity', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'flood',
      latitude: 6.9,
      longitude: 79.8,
      severity: 'catastrophic',
      reporter_id: testUserId
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid severity/);
  });

  test('TC-04-06: rejects out-of-range coordinates', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'flood',
      latitude: 99,
      longitude: 79.8,
      severity: 'high',
      reporter_id: testUserId
    });
    expect(res.status).toBe(400);
  });

  test('TC-04-07: creates a valid report with default status pending', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'flood',
      latitude: 6.927100,
      longitude: 79.861200,
      severity: 'high',
      description: 'Automated test report',
      reporter_id: testUserId
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.reporter_id).toBe(testUserId);
  });

  test('TC-04-08: normalizes uppercase input (Flood/HIGH -> flood/high)', async () => {
    const res = await request(app).post('/api/hazards').send({
      type: 'Flood',
      latitude: 6.9,
      longitude: 79.8,
      severity: 'HIGH',
      description: 'Automated test report (case check)',
      reporter_id: testUserId
    });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('flood');
    expect(res.body.data.severity).toBe('high');
  });
});

// =========================================================================
// TC-05: SOS
// =========================================================================
describe('SOS API', () => {
  test('TC-05-01: rejects SOS without coordinates', async () => {
    const res = await request(app).post('/api/sos').send({ user_id: testUserId });
    expect(res.status).toBe(400);
  });

  test('TC-05-02: rejects SOS without user_id', async () => {
    const res = await request(app)
      .post('/api/sos')
      .send({ latitude: 6.68, longitude: 80.40 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/user_id/);
  });

  test('TC-05-03: rejects SOS with out-of-range coordinates', async () => {
    const res = await request(app)
      .post('/api/sos')
      .send({ user_id: testUserId, latitude: 6.68, longitude: 200 });
    expect(res.status).toBe(400);
  });

  test('TC-05-04: creates an SOS with default status active', async () => {
    const res = await request(app)
      .post('/api/sos')
      .send({ user_id: testUserId, latitude: 6.685000, longitude: 80.401000 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('active');
    createdSosId = res.body.data.id;
  });

  test('TC-05-05: GET /api/sos lists the newly created active SOS', async () => {
    const res = await request(app).get('/api/sos');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s.id);
    expect(ids).toContain(createdSosId);
    // every returned row must be active
    expect(res.body.data.every((s) => s.status === 'active')).toBe(true);
  });
});
