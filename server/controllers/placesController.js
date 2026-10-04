/**
 * JusticeNow — Places proxy controller (PUBLIC).
 *
 * POST /api/places/autocomplete  { input }  — type-ahead place suggestions.
 * GET  /api/places/details?place_id=...      — resolve a suggestion to coords.
 *
 * Used by the map location picker's search box. PUBLIC + tokenless (reporters
 * never authenticate). Rate-limited (it calls a paid Google endpoint). The
 * search text is a place name, never case content, and is NEVER logged — that is
 * WHY autocomplete is a POST (the request logger records the URL, so the typed
 * text must stay in the body, not the query string). details uses an opaque
 * place_id, which is safe to appear in the URL.
 */

const { autocomplete, details, isConfigured } = require('../services/placesService');

const MIN_INPUT = 2;
const MAX_INPUT = 120;

async function autocompleteHandler(req, res) {
  if (req.isRateLimited) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment.' });
  }
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'Place search is not available.' });
  }
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  const sessionToken =
    typeof req.body?.session_token === 'string' ? req.body.session_token.trim() : undefined;
  if (input.length < MIN_INPUT) {
    // Not an error — just nothing to search yet.
    return res.json({ success: true, data: { predictions: [] } });
  }
  if (input.length > MAX_INPUT) {
    return res.status(400).json({ success: false, message: 'Search text is too long.' });
  }
  try {
    const predictions = await autocomplete(input, sessionToken);
    return res.json({ success: true, data: { predictions } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err && err.message ? err.message : 'Place search failed.';
    // NEVER log the query or err detail.
    return res.status(status).json({ success: false, message });
  }
}

async function detailsHandler(req, res) {
  if (req.isRateLimited) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment.' });
  }
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'Place search is not available.' });
  }
  const placeId = typeof req.query.place_id === 'string' ? req.query.place_id.trim() : '';
  const sessionToken =
    typeof req.query.session_token === 'string' ? req.query.session_token.trim() : undefined;
  if (!placeId) {
    return res.status(400).json({ success: false, message: 'place_id is required.' });
  }
  try {
    const place = await details(placeId, sessionToken);
    return res.json({ success: true, data: { place } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err && err.message ? err.message : 'Could not open that place.';
    return res.status(status).json({ success: false, message });
  }
}

module.exports = { autocomplete: autocompleteHandler, details: detailsHandler };
