/**
 * JusticeNow — AI Legal Guidance controller (PUBLIC).
 *
 * POST /api/ai/guidance — a person describes a situation; we return EDUCATIONAL
 * guidance (case category, applicable Sri Lankan law, steps) from the model, PLUS
 * real legal-aid organisations from our own directory (filtered by the category
 * and optional district). This is NOT filing a case — nothing is stored.
 *
 * PRIVACY: never log the scenario or the guidance. Rate-limited to curb abuse of
 * the paid AI endpoint. The API key stays server-side (see aiGuidanceService).
 */

const { getGuidance, getLawyers, getLegalBasis, isConfigured } = require('../services/aiGuidanceService');
const { listOrganisations } = require('../services/organisationService');
const { DISTRICTS } = require('../constants');

// Web search for real lawyers legitimately takes ~15-20s, so give it headroom
// (the mobile client allows 45s and guidance itself is only a few seconds). If
// it still exceeds this, we return guidance + orgs and an empty lawyers list.
const LAWYER_LOOKUP_TIMEOUT_MS = 35000;
// The legal-basis web search is a second grounded lookup; give it the same
// headroom. If it exceeds this, we return the rest with an empty legal basis.
const LEGAL_BASIS_TIMEOUT_MS = 35000;

/** Resolve to `fallback` if the promise doesn't settle within ms (best-effort). */
function withTimeout(promise, ms, fallback = []) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  // clearTimeout on settle so a fast lookup doesn't leave a timer holding the
  // event loop open for the rest of the window.
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

// Keep the scenario within sane bounds — enough to describe an incident, not an
// essay (protects the token budget and keeps latency down).
const MIN_LEN = 15;
const MAX_LEN = 2000;

async function guidance(req, res) {
  if (req.isRateLimited) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment and try again.',
    });
  }

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Legal guidance is not available right now.',
    });
  }

  const scenario = typeof req.body?.scenario === 'string' ? req.body.scenario.trim() : '';
  const district = typeof req.body?.district === 'string' ? req.body.district.trim() : '';
  // Optional output language so the client can re-generate + read the guidance
  // aloud in English/Tamil/Sinhala. Anything else is ignored (model uses the
  // scenario's own language, as before).
  const rawLang = typeof req.body?.language === 'string' ? req.body.language.trim() : '';
  const language = ['en', 'ta', 'si'].includes(rawLang) ? rawLang : undefined;

  if (scenario.length < MIN_LEN) {
    return res.status(400).json({
      success: false,
      message: `Please describe the situation in a little more detail (at least ${MIN_LEN} characters).`,
    });
  }
  if (scenario.length > MAX_LEN) {
    return res.status(400).json({
      success: false,
      message: `Please keep the description under ${MAX_LEN} characters.`,
    });
  }

  try {
    const guide = await getGuidance(scenario, language);

    const validDistrict = DISTRICTS.includes(district) ? district : undefined;

    // Ground the "find a lawyer" part in REAL data from two sources — never the
    // guidance model itself. Run both in parallel now that we have the category:
    //  1. organisations: our own vetted legal-aid directory (Supabase).
    //  2. lawyers: real, source-cited lawyers found via Claude web search.
    // Both are best-effort — a failure in either still returns the guidance.
    const [organisations, lawyers, legalBasis] = await Promise.all([
      (async () => {
        try {
          let orgs = (await listOrganisations({ caseType: guide.category, district: validDistrict })) || [];
          // If a district filter yielded nothing, fall back to category-only so
          // the person still sees relevant help elsewhere in the country.
          if (orgs.length === 0 && validDistrict) {
            orgs = (await listOrganisations({ caseType: guide.category })) || [];
          }
          return orgs;
        } catch {
          return [];
        }
      })(),
      withTimeout(getLawyers(guide.category, validDistrict, language), LAWYER_LOOKUP_TIMEOUT_MS),
      // Real, source-cited legal provisions (Act/section/penalty) for this case
      // type. Best-effort and grounded — its own empty shape on timeout/failure.
      withTimeout(getLegalBasis(guide.category, language), LEGAL_BASIS_TIMEOUT_MS, {
        provisions: [],
        outlook: { helps: [], hurts: [] },
      }),
    ]);

    return res.json({
      success: true,
      data: { guidance: guide, organisations, lawyers, legal_basis: legalBasis },
    });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not generate guidance. Please try again.';
    // NEVER log the scenario or err detail (may echo the prompt).
    return res.status(status).json({ success: false, message });
  }
}

module.exports = { guidance };
