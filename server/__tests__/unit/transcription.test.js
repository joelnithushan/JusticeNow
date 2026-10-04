/**
 * Unit tests — transcriptionService.encodingFor / isConfigured.
 * Pure helpers; no HTTP, no Google.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { encodingFor, isConfigured } from '../../services/transcriptionService.js';

const originalSpeech = process.env.GOOGLE_SPEECH_API_KEY;
const originalPlaces = process.env.GOOGLE_PLACES_API_KEY;

afterEach(() => {
  if (originalSpeech === undefined) delete process.env.GOOGLE_SPEECH_API_KEY;
  else process.env.GOOGLE_SPEECH_API_KEY = originalSpeech;
  if (originalPlaces === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = originalPlaces;
});

describe('encodingFor', () => {
  it('detects wav / amr / flac / mp3 / ogg', () => {
    expect(encodingFor('a.wav', '')).toEqual({ encoding: 'LINEAR16' });
    expect(encodingFor('a.amr', '')).toMatchObject({ encoding: 'AMR_WB' });
    expect(encodingFor('a.flac', '')).toEqual({ encoding: 'FLAC' });
    expect(encodingFor('a.mp3', '')).toEqual({ encoding: 'MP3' });
    expect(encodingFor('a.ogg', '')).toEqual({ encoding: 'OGG_OPUS' });
  });

  it('returns null for unsupported m4a/aac (Speech v1 sync)', () => {
    expect(encodingFor('clip.m4a', 'audio/mp4')).toBeNull();
    expect(encodingFor('clip.aac', 'audio/aac')).toBeNull();
  });
});

describe('isConfigured', () => {
  it('is true when GOOGLE_SPEECH_API_KEY is set', () => {
    process.env.GOOGLE_SPEECH_API_KEY = 'x';
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(isConfigured()).toBe(true);
  });

  it('falls back to GOOGLE_PLACES_API_KEY', () => {
    delete process.env.GOOGLE_SPEECH_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = 'y';
    expect(isConfigured()).toBe(true);
  });

  it('is false when neither key is set', () => {
    delete process.env.GOOGLE_SPEECH_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(isConfigured()).toBe(false);
  });
});
