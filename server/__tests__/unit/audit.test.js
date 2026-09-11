/**
 * Unit tests — audit trail service.
 *
 * Following the repo's established pattern (see integration/reports.test.js) we
 * do NOT mock the Supabase module; instead we stub the global fetch it uses and
 * return canned PostgREST responses. The stub must be installed before the
 * service is imported, because config/supabase builds its client at import time
 * and captures fetch then.
 *
 * The audit service is best-effort: it must reject an unknown action (a coding
 * bug) but must NOT throw when the DB insert fails at runtime — losing an audit
 * row must never fail the action being audited.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// config/supabase requires these; the values are never used for a real call.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

// Records the last insert body, and lets each test force a success or failure.
let lastInsert = null;
let insertResponse = { status: 201, body: '[]' };

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);
  if (options.method === 'POST' && target.includes('/rest/v1/audit_log')) {
    lastInsert = { url: target, body: options.body ? JSON.parse(options.body) : null };
    return new Response(insertResponse.body, {
      status: insertResponse.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
});

vi.stubGlobal('fetch', fetchMock);
if (typeof globalThis.WebSocket === 'undefined') {
  vi.stubGlobal('WebSocket', class WebSocketStub {});
}

const { writeAudit } = await import('../../services/audit.js');

beforeEach(() => {
  lastInsert = null;
  insertResponse = { status: 201, body: '[]' };
  fetchMock.mockClear();
});

describe('writeAudit — validation', () => {
  it('rejects an action that is not in AUDIT_ACTIONS', async () => {
    await expect(writeAudit({ action: 'not_a_real_action' })).rejects.toThrow(
      /Unknown audit action/
    );
    // Nothing should have been written for an invalid action.
    expect(lastInsert).toBeNull();
  });
});

describe('writeAudit — insert shape', () => {
  it('inserts a row with the expected shape for a valid action', async () => {
    await writeAudit({
      caseId: 'case-1',
      actorId: 'staff-1',
      action: 'status_changed',
      detail: { from: 'received', to: 'under_review' },
    });

    expect(lastInsert).toBeTruthy();
    expect(lastInsert.url).toContain('/rest/v1/audit_log');
    const inserted = Array.isArray(lastInsert.body) ? lastInsert.body[0] : lastInsert.body;
    expect(inserted).toEqual({
      case_id: 'case-1',
      actor_id: 'staff-1',
      action: 'status_changed',
      detail: { from: 'received', to: 'under_review' },
    });
  });

  it('defaults case_id, actor_id and detail to null when omitted', async () => {
    await writeAudit({ action: 'staff_login' });

    const inserted = Array.isArray(lastInsert.body) ? lastInsert.body[0] : lastInsert.body;
    expect(inserted).toEqual({
      case_id: null,
      actor_id: null,
      action: 'staff_login',
      detail: null,
    });
  });
});

describe('writeAudit — never throws into the request path', () => {
  it('resolves (does not throw) when the supabase insert returns an error', async () => {
    // 400 with a PostgREST error body simulates a failed insert.
    insertResponse = { status: 400, body: JSON.stringify({ message: 'db exploded' }) };

    await expect(
      writeAudit({ action: 'note_added', caseId: 'case-1', actorId: 'staff-1' })
    ).resolves.toBeUndefined();
  });

  it('resolves when fetch itself throws', async () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });

    await expect(writeAudit({ action: 'org_created', actorId: 'staff-1' })).resolves.toBeUndefined();
  });
});
