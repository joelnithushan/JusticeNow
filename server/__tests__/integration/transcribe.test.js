/**
 * Integration tests — POST /api/transcribe voice transcription proxy (PUBLIC).
 *
 * Fetch-stub pattern (see places.test.js / staffAdmin.test.js): stub global
 * fetch BEFORE importing app.js. Audio stays in memory via multer — never on disk.
 *
 * Pins down:
 *  - successful transcript return
 *  - Speech API disabled / blocked fails SOFT (502 with safe message — never 500)
 *  - 503 when no Google speech/places key is configured
 *  - audio bytes and transcript text are NEVER logged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.GOOGLE_SPEECH_API_KEY = process.env.GOOGLE_SPEECH_API_KEY || 'test-speech-key';

const SENSITIVE_TRANSCRIPT = 'The officer took my phone near Pettah market';
// Tiny fake WAV-ish buffer — encodingFor only checks the filename/mime.
const FAKE_WAV = Buffer.from('RIFF____WAVEfmt ');

let speechMode = 'ok'; // 'ok' | 'blocked' | 'network_error'
let lastSpeechBody = null;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fetchMock = vi.fn(async (url, options = {}) => {
  const target = String(url);

  if (target.includes('speech.googleapis.com/v1/speech:recognize')) {
    lastSpeechBody = options.body ? JSON.parse(options.body) : null;
    if (speechMode === 'network_error') throw new Error('ECONNREFUSED');
    if (speechMode === 'blocked') {
      // Typical "API not enabled" / permission denied from Google — must fail soft.
      return json(
        { error: { code: 403, message: 'Cloud Speech-to-Text API has not been used' } },
        403,
      );
    }
    return json({
      results: [
        {
          alternatives: [{ transcript: SENSITIVE_TRANSCRIPT }],
        },
      ],
    });
  }

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
  speechMode = 'ok';
  lastSpeechBody = null;
  process.env.GOOGLE_SPEECH_API_KEY = 'test-speech-key';
  delete process.env.GOOGLE_PLACES_API_KEY; // exercise the speech-specific key path
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

function postAudio(
  appInstance,
  { language = 'en', filename = 'report.wav', buffer = FAKE_WAV, contentType = 'audio/wav' } = {},
) {
  return request(appInstance)
    .post('/api/transcribe')
    .field('language', language)
    .attach('audio', buffer, { filename, contentType });
}

describe('POST /api/transcribe', () => {
  it('returns a transcript on the happy path', async () => {
    const res = await postAudio(app);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transcript).toBe(SENSITIVE_TRANSCRIPT);
    expect(lastSpeechBody?.audio?.content).toBeTruthy();
    expect(lastSpeechBody?.config?.languageCode).toBe('en-US');
  });

  it('returns 503 when no Google speech key is configured', async () => {
    delete process.env.GOOGLE_SPEECH_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;

    const res = await postAudio(app);

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not available/i);
    expect(lastSpeechBody).toBeNull();
  });

  it('fails soft (502, not 500) when Speech API is disabled/blocked', async () => {
    speechMode = 'blocked';

    const res = await postAudio(app);

    expect(res.status).toBe(502);
    expect(res.status).not.toBe(500);
    // Soft message — reporter can still submit the audio.
    expect(res.body.message).toMatch(/still submit|Could not transcribe/i);
    // Never leak the raw Google "API has not been used" text.
    expect(JSON.stringify(res.body)).not.toMatch(/Cloud Speech-to-Text API has not been used/i);
  });

  it('fails soft on network errors to Google (502)', async () => {
    speechMode = 'network_error';

    const res = await postAudio(app);

    expect(res.status).toBe(502);
    expect(res.status).not.toBe(500);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  it('returns 400 when no audio file is attached', async () => {
    const res = await request(app).post('/api/transcribe').field('language', 'en');

    expect(res.status).toBe(400);
    expect(lastSpeechBody).toBeNull();
  });

  it('returns 415 for unsupported audio formats (e.g. m4a)', async () => {
    const res = await postAudio(app, {
      filename: 'clip.m4a',
      buffer: Buffer.from('fake-aac'),
      contentType: 'audio/mp4',
    });

    expect(res.status).toBe(415);
    expect(lastSpeechBody).toBeNull();
  });

  it('never logs the transcript or audio payload', async () => {
    await postAudio(app);

    const blob = consoleBlob();
    expect(blob).not.toContain(SENSITIVE_TRANSCRIPT);
    // Base64 audio content must not appear in logs either.
    if (lastSpeechBody?.audio?.content) {
      expect(blob).not.toContain(lastSpeechBody.audio.content.slice(0, 32));
    }
  });
});
