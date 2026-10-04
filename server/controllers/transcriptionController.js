/**
 * JusticeNow — voice transcription controller (PUBLIC).
 *
 * POST /api/transcribe  (multipart: `audio` file + `language`) — turns a short
 * spoken report into text. PUBLIC + tokenless (reporters never authenticate) and
 * rate-limited (it calls a paid Google endpoint). The audio and the resulting
 * transcript are case content: NEVER logged here or in the service.
 */

const { transcribe, isConfigured } = require('../services/transcriptionService');

async function transcribeHandler(req, res) {
  if (req.isRateLimited) {
    return res
      .status(429)
      .json({ success: false, message: 'Too many requests. Please wait a moment.' });
  }
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'Voice transcription is not available.' });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'No audio was provided.' });
  }

  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'en';

  try {
    const { transcript } = await transcribe({
      buffer: req.file.buffer,
      fileName: req.file.originalname || '',
      mimeType: req.file.mimetype || '',
      language,
    });
    return res.json({ success: true, data: { transcript } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err && err.message ? err.message : 'Could not transcribe the recording.';
    // NEVER log the audio or err detail — both can carry case content.
    return res.status(status).json({ success: false, message });
  }
}

module.exports = { transcribe: transcribeHandler };
