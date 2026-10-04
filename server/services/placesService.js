/**
 * JusticeNow — Google Places proxy service (server-side).
 *
 * WHY THIS EXISTS: the map location picker offers type-ahead place search. We
 * proxy Google Places (New) through the server so the Google API key stays
 * SERVER-SIDE only (never shipped in the app bundle) and the reporter's device
 * never talks to Google directly — the server does.
 *
 * PRIVACY: the search text is a place name, not case content, but we still treat
 * it carefully: it is NEVER logged, never stored, and only used to fetch
 * suggestions/coordinates. The picker still reverse-geocodes the final PIN via
 * the device (Apple) to produce the coarse place name that gets stored, so
 * Google is only a "find the spot" helper, not the source of stored data.
 *
 * The API key (GOOGLE_PLACES_API_KEY) is optional: when it is absent the feature
 * is simply "not configured" (HTTP 503) and the client falls back to the basic
 * on-device geocoder. Restrict the key to the Places API in Google Cloud.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places'; // + /{placeId}

/** Is the Places proxy configured (API key present)? */
function isConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/**
 * Autocomplete a place query, biased to Sri Lanka.
 *
 * @param {string} input        the partial place name the user is typing
 * @param {string} [sessionToken]  a client-generated session token (billing/
 *        grouping; opaque). Passed straight through when provided.
 * @returns {Promise<{place_id:string,description:string,main_text:string,secondary_text:string}[]>}
 * @throws {{status:number,message:string}} on config/upstream failure.
 */
async function autocomplete(input, sessionToken) {
  if (!isConfigured()) {
    throw { status: 503, message: 'Place search is not available.' };
  }
  const body = {
    input,
    // Restrict results to Sri Lanka so the reporter sees local places first.
    includedRegionCodes: ['lk'],
  };
  if (sessionToken) body.sessionToken = sessionToken;

  let response;
  try {
    response = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Never log the query.
    throw { status: 502, message: 'Place search is unavailable right now.' };
  }
  if (!response.ok) {
    throw { status: 502, message: 'Place search is unavailable right now.' };
  }

  const data = await response.json();
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return suggestions
    .map((s) => s && s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      place_id: typeof p.placeId === 'string' ? p.placeId : '',
      description: p.text && typeof p.text.text === 'string' ? p.text.text : '',
      main_text:
        p.structuredFormat && p.structuredFormat.mainText
          ? p.structuredFormat.mainText.text || ''
          : '',
      secondary_text:
        p.structuredFormat && p.structuredFormat.secondaryText
          ? p.structuredFormat.secondaryText.text || ''
          : '',
    }))
    .filter((p) => p.place_id && (p.description || p.main_text))
    .slice(0, 6);
}

/**
 * Resolve a place_id to coordinates + a display name.
 *
 * @param {string} placeId  a place_id from autocomplete()
 * @param {string} [sessionToken]  the same session token used for autocomplete
 * @returns {Promise<{latitude:number,longitude:number,place_name:string}>}
 * @throws {{status:number,message:string}} on config/upstream failure.
 */
async function details(placeId, sessionToken) {
  if (!isConfigured()) {
    throw { status: 503, message: 'Place search is not available.' };
  }
  const url = new URL(`${DETAILS_URL}/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
        // Only ask for the fields we need — keeps the response (and cost) minimal.
        'X-Goog-FieldMask': 'location,displayName,formattedAddress',
      },
    });
  } catch {
    throw { status: 502, message: 'Could not open that place. Please try again.' };
  }
  if (!response.ok) {
    throw { status: 502, message: 'Could not open that place. Please try again.' };
  }

  const data = await response.json();
  const loc = data && data.location;
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    throw { status: 502, message: 'Could not open that place. Please try again.' };
  }
  const placeName =
    (data.displayName && data.displayName.text) ||
    (typeof data.formattedAddress === 'string' ? data.formattedAddress : '') ||
    '';
  return { latitude: loc.latitude, longitude: loc.longitude, place_name: placeName };
}

module.exports = { isConfigured, autocomplete, details };
