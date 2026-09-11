/**
 * Integration tests — /api/organisations (public legal resource directory).
 *
 * Follows the repo pattern (see integration/reports.test.js and status.test.js):
 * we do NOT hit a real database. We stub the global fetch that the Supabase
 * client uses and hand back canned PostgREST responses. The stub is installed
 * BEFORE the app is imported, because the app builds its Supabase client at
 * import time and captures fetch then.
 *
 * What we pin down here:
 *  - list returns only ACTIVE orgs with the public columns, and the query it
 *    sends constrains is_active = true;
 *  - the district and case_type filters produce the right PostgREST query
 *    (asserted against the request URL);
 *  - an invalid district / case_type filter → 400 with a helpful message and
 *    NO database call;
 *  - GET /:id found returns the org; not-found/inactive → generic 404 body.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
// The app wires in staff auth, which needs a signing secret at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

// What the fetch stub returns for the organisations query. `orgRows` is the list
// body; `singleRow` is what a maybeSingle() detail lookup returns (object|null).
let orgRows = [];
let singleRow = null;
// Records the URLs the app actually requested so tests can assert the query
// (filters, is_active) was built server-side rather than in the client.
let lastListUrl = null;

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  const method = options.method || 'GET';

  if (method === 'GET' && target.includes('/rest/v1/organisations')) {
    // The detail lookup filters by primary key (id=eq.<uuid>); the list never
    // does. Branch on that so both share one stub. (supabase-js applies the
    // maybeSingle Accept header internally, so it is not visible on options.)
    const isSingle = target.includes('id=eq.');
    if (isSingle) {
      return new Response(JSON.stringify(singleRow), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    lastListUrl = target;
    return new Response(JSON.stringify(orgRows), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { default: app } = await import('../../app.js');

// A full public org row as it comes back from the PUBLIC_ORG_COLUMNS projection.
const orgA = {
  id: 'org-uuid-1',
  name: 'Jaffna Legal Aid Centre',
  description: 'Free legal advice for land and detention matters in the north.',
  district: 'Jaffna',
  case_types: ['land_dispute', 'unlawful_detention'],
  contact_phone: '+94 21 222 3344',
  contact_email: 'help@jaffnalegal.example',
};

beforeEach(() => {
  orgRows = [];
  singleRow = null;
  lastListUrl = null;
  fetchMock.mockClear();
});

describe('GET /api/organisations — list', () => {
  it('returns active orgs with the public columns and filters is_active server-side', async () => {
    orgRows = [orgA];

    const res = await request(app).get('/api/organisations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([orgA]);

    // The active-only boundary must be in the QUERY, not the client.
    expect(lastListUrl).toContain('is_active=eq.true');
    // Only the public projection is requested — is_active is a filter, not a
    // returned column, so it must not appear in select.
    expect(lastListUrl).toContain('name');
    expect(lastListUrl).not.toContain('created_at');
  });

  it('applies the district filter as an equality on the query', async () => {
    orgRows = [orgA];

    await request(app).get('/api/organisations').query({ district: 'Jaffna' });

    expect(lastListUrl).toContain('district=eq.Jaffna');
  });

  it('applies the case_type filter as an array-contains on the query', async () => {
    orgRows = [orgA];

    await request(app).get('/api/organisations').query({ case_type: 'land_dispute' });

    // PostgREST array-contains: case_types=cs.{land_dispute}
    expect(decodeURIComponent(lastListUrl)).toContain('case_types=cs.{land_dispute}');
  });

  it('rejects an invalid district filter with a 400 and no DB call', async () => {
    const res = await request(app)
      .get('/api/organisations')
      .query({ district: 'Atlantis' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/district/);
    // Validation must fail BEFORE any organisations query is issued.
    expect(lastListUrl).toBeNull();
  });

  it('rejects an invalid case_type filter with a 400 and no DB call', async () => {
    const res = await request(app)
      .get('/api/organisations')
      .query({ case_type: 'nonsense' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/case_type/);
    expect(lastListUrl).toBeNull();
  });
});

describe('GET /api/organisations/:id — detail', () => {
  it('returns the org when found and active', async () => {
    singleRow = orgA;

    const res = await request(app).get('/api/organisations/org-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(orgA);
  });

  it('returns a generic 404 when not found or inactive', async () => {
    singleRow = null; // no active org with that id

    const res = await request(app).get('/api/organisations/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });
});
