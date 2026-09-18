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

const { getGuidance, isConfigured } = require('../services/aiGuidanceService');
const { listOrganisations } = require('../services/organisationService');
const { DISTRICTS } = require('../constants');

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
    const guide = await getGuidance(scenario);

    // Ground the "find a lawyer" part in REAL directory data — never the model.
    // Filter active orgs by the guidance category, and by district when given.
    let organisations = [];
    try {
      const validDistrict = DISTRICTS.includes(district) ? district : undefined;
      const res1 = await listOrganisations({
        caseType: guide.category,
        district: validDistrict,
      });
      organisations = res1 || [];
      // If a district filter yielded nothing, fall back to category-only so the
      // person still sees relevant help elsewhere in the country.
      if (organisations.length === 0 && validDistrict) {
        organisations = (await listOrganisations({ caseType: guide.category })) || [];
      }
    } catch {
      organisations = []; // directory lookup is best-effort; guidance still returns.
    }

    return res.json({ success: true, data: { guidance: guide, organisations } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message =
      err && err.message ? err.message : 'Could not generate guidance. Please try again.';
    // NEVER log the scenario or err detail (may echo the prompt).
    return res.status(status).json({ success: false, message });
  }
}

module.exports = { guidance };
