/**
 * JusticeNow — voice-report transcription service (server-side proxy).
 *
 * WHY THIS EXISTS: a reporter can record a spoken account instead of typing.
 * Turning that audio into text lets staff triage without listening to the full
 * recording, and makes a Sinhala/Tamil account searchable. We proxy Google
 * Speech-to-Text through the server so the API key stays SERVER-SIDE only and
 * the reporter's device never talks to Google directly.
 *
 * PRIVACY: the audio IS case content. We therefore:
 *  - NEVER log the audio, the transcript, or any excerpt of either;
 *  - hold the bytes only for the duration of the request (no disk write);
 *  - return the text to the caller and forget it.
 * This is a deliberate, documented trade-off (chosen by product): the spoken
 * account is sent to Google for transcription, exactly as typed narratives are
 * already stored on our own infrastructure. It carries no reporter identity.
 *
 * CONFIG: needs a Google Cloud API key with the *Cloud Speech-to-Text API*
 * enabled — GOOGLE_SPEECH_API_KEY, falling back to GOOGLE_PLACES_API_KEY if you
 * use one unrestricted key for both. When absent the feature is "not configured"
 * (HTTP 503) and the client simply keeps the audio without a transcript.
 */

const RECOGNIZE_URL = 'https://speech.googleapis.com/v1/speech:recognize';

// App language code -> Google BCP-47 code. The primary is spoken first; the
// others are passed as alternatives so a mixed-language account still resolves.
const LANGUAGE_CODES = {
  en: 'en-US',
  ta: 'ta-IN',
  si: 'si-LK',
};

/** Is transcription configured (an API key is present)? */
function isConfigured() {
  return Boolean(apiKey());
}

function apiKey() {
  return process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
}

/**
 * Derive Google's audio `encoding` (and sample rate, when required) from the
 * uploaded file's extension/mime. Returning null means "we cannot transcribe
 * this format" — the caller turns that into a clear 415.
 */
function encodingFor(fileName = '', mimeType = '') {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (name.endsWith('.wav') || mime.includes('wav') || mime.includes('x-wav')) {
    // LINEAR16 in a WAV container: Google reads the sample rate from the header,
    // so we deliberately omit sampleRateHertz.
    return { encoding: 'LINEAR16' };
  }
  if (name.endsWith('.3gp') || name.endsWith('.amr') || mime.includes('amr')) {
    // Android AMR_WB preset records at 16 kHz.
    return { encoding: 'AMR_WB', sampleRateHertz: 16000 };
  }
  if (name.endsWith('.flac') || mime.includes('flac')) return { encoding: 'FLAC' };
  if (name.endsWith('.mp3') || mime.includes('mpeg')) return { encoding: 'MP3' };
  if (name.endsWith('.ogg') || mime.includes('ogg')) return { encoding: 'OGG_OPUS' };
  // AAC/M4A/MP4 are NOT supported by the Speech-to-Text v1 sync API.
  return null;
}

/**
 * Transcribe a short spoken report.
 *
 * @param {object} params
 * @param {Buffer} params.buffer     the audio bytes (from multer memory storage).
 * @param {string} params.fileName   original filename (for format detection).
 * @param {string} params.mimeType   uploaded mime type (for format detection).
 * @param {string} [params.language] app language code ('en'|'ta'|'si').
 * @returns {Promise<{transcript:string}>}
 * @throws {{status:number,message:string}} on config/format/upstream failure.
 */
async function transcribe({ buffer, fileName = '', mimeType = '', language = 'en' }) {
  if (!isConfigured()) {
    throw { status: 503, message: 'Voice transcription is not available.' };
  }
  if (!buffer || buffer.length === 0) {
    throw { status: 400, message: 'No audio was provided to transcribe.' };
  }

  const enc = encodingFor(fileName, mimeType);
  if (!enc) {
    throw {
      status: 415,
      message: 'This audio format cannot be transcribed. Please record again.',
    };
  }

  const primary = LANGUAGE_CODES[language] || 'en-US';
  const alternatives = Object.values(LANGUAGE_CODES).filter((c) => c !== primary);

  const body = {
    config: {
      ...enc,
      languageCode: primary,
      alternativeLanguageCodes: alternatives,
      enableAutomaticPunctuation: true,
    },
    audio: { content: buffer.toString('base64') },
  };

  let response;
  try {
    response = await fetch(`${RECOGNIZE_URL}?key=${encodeURIComponent(apiKey())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Never log — the request body carries the audio.
    throw { status: 502, message: 'Transcription is unavailable right now.' };
  }

  if (!response.ok) {
    // Surface a generic, non-sensitive message. A 403 here almost always means
    // the Speech-to-Text API is not enabled on the key's project.
    throw {
      status: 502,
      message: 'Could not transcribe the recording. You can still submit the audio.',
    };
  }

  const data = await response.json();
  const transcript = (data.results || [])
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();

  return { transcript };
}

module.exports = { transcribe, isConfigured, encodingFor, LANGUAGE_CODES };
