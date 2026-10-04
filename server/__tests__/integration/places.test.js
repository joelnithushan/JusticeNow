/**
 * Integration tests — /api/places Google Places proxy (PUBLIC).
 *
 * Same fetch-stub pattern as staffAdmin.test.js: stub global fetch BEFORE
 * importing app.js. No real Google call, no real Supabase.
 *
 * Pins down:
 *  - autocomplete + details happy paths
 *  - 503 when GOOGLE_PLACES_API_KEY is absent (client falls back to on-device)
 *  - upstream Google failures become generic 502 — never raw error bodies
 *  - search text / place names are never written to console (privacy)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
// Key present by default so happy-path tests work; individual cases unset it.
process.env.GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'test-places-key';

const PLACE_ID = 'ChIJtestPlaceSriLanka0001';
const SENSITIVE_QUERY = 'Colombo Fort near witness home'; // must NEVER appear in logs

let googleMode = 'ok'; // 'ok' | 'upstream_error' | 'network_error'
let lastGoogleRequest = null;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = (options.method || 'GET').toUpperCase();

  // ---- Google Places Autocomplete (New) ----
  if (target.includes('places.googleapis.com/v1/places:autocomplete')) {
    lastGoogleRequest = {
      kind: 'autocomplete',
      method,
      body: options.body ? JSON.parse(options.body) : null,
      apiKeyHeader: options.headers?.['X-Goog-Api-Key'] || options.headers?.['x-goog-api-key'],
    };
    if (googleMode === 'network_error') throw new Error('ECONNREFUSED');
    if (googleMode === 'upstream_error') {
      // Deliberately juicy upstream body — the client must NEVER see this text.
      return json({ error: { message: 'API_KEY_INVALID raw google detail' } }, 403);
    }
    return json({
      suggestions: [
        {
          placePrediction: {
            placeId: PLACE_ID,
            text: { text: 'Colombo Fort, Colombo, Sri Lanka' },
            structuredFormat: {
              mainText: { text: 'Colombo Fort' },
              secondaryText: { text: 'Colombo, Sri Lanka' },
            },
          },
        },
      ],
    });
  }

  // ---- Google Place Details ----
  if (target.includes('places.googleapis.com/v1/places/')) {
    lastGoogleRequest = {
      kind: 'details',
      method,
      target,
      apiKeyHeader: options.headers?.['X-Goog-Api-Key'] || options.headers?.['x-goog-api-key'],
    };
    if (googleMode === 'network_error') throw new Error('ECONNREFUSED');
    if (googleMode === 'upstream_error') {
      return json({ error: { message: 'PERMISSION_DENIED raw google detail' } }, 403);
    }
    return json({
      location: { latitude: 6.9344, longitude: 79.8428 },
      displayName: { text: 'Colombo Fort' },
      formattedAddress: 'Colombo Fort, Colombo, Sri Lanka',
    });
  }

  // Default: empty success for any incidental Supabase probe.
  return json([]);
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

let logSpy;
let errorSpy;
let warnSpy;

beforeEach(() => {
  googleMode = 'ok';
  lastGoogleRequest = null;
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
  fetchMock.mockClear();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  logSpy?.mockRestore();
  errorSpy?.mockRestore();
  warnSpy?.mockRestore();
});

function consoleBlob() {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    .flat()
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join('\n');
}

describe('POST /api/places/autocomplete', () => {
  it('returns predictions on the happy path (Google stubbed)', async () => {
    const res = await request(app)
      .post('/api/places/autocomplete')
      .send({ input: 'Colombo Fort', session_token: 'sess-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.predictions).toHaveLength(1);
    expect(res.body.data.predictions[0]).toMatchObject({
      place_id: PLACE_ID,
      main_text: 'Colombo Fort',
    });
    expect(lastGoogleRequest?.kind).toBe('autocomplete');
    expect(lastGoogleRequest?.body?.includedRegionCodes).toEqual(['lk']);
  });

  it('returns 503 when the Google Places key is not configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const res = await request(app)
      .post('/api/places/autocomplete')
      .send({ input: 'Colombo' });

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not available/i);
    // Must not have called Google at all.
    expect(lastGoogleRequest).toBeNull();
  });

  it('maps upstream Google failures to a generic 502 (no raw error leak)', async () => {
    googleMode = 'upstream_error';

    const res = await request(app)
      .post('/api/places/autocomplete')
      .send({ input: 'Colombo' });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/API_KEY_INVALID|raw google/i);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  it('never logs the search text (reporter place query stays off the console)', async () => {
    await request(app).post('/api/places/autocomplete').send({ input: SENSITIVE_QUERY });

    expect(consoleBlob()).not.toContain(SENSITIVE_QUERY);
  });
});

describe('GET /api/places/details', () => {
  it('returns coordinates and place_name on the happy path', async () => {
    const res = await request(app)
      .get('/api/places/details')
      .query({ place_id: PLACE_ID, session_token: 'sess-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.place).toMatchObject({
      latitude: 6.9344,
      longitude: 79.8428,
      place_name: 'Colombo Fort',
    });
    expect(lastGoogleRequest?.kind).toBe('details');
  });

  it('returns 503 when the Google Places key is not configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const res = await request(app).get('/api/places/details').query({ place_id: PLACE_ID });

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not available/i);
    expect(lastGoogleRequest).toBeNull();
  });

  it('returns 400 when place_id is missing', async () => {
    const res = await request(app).get('/api/places/details');
    expect(res.status).toBe(400);
    expect(lastGoogleRequest).toBeNull();
  });

  it('never returns raw upstream Google error text', async () => {
    googleMode = 'upstream_error';

    const res = await request(app).get('/api/places/details').query({ place_id: PLACE_ID });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/PERMISSION_DENIED|raw google/i);
  });
});
