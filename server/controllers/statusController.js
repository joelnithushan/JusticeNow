/**
 * JusticeNow — Anonymous status lookup controller.
 *
 * ANONYMITY / NO-ORACLE RULE: "not found", "rate limited", and "malformed code"
 * ALL return the IDENTICAL generic 404 body below. This is deliberate: the
 * reference code is a guessable password, so we must never let a caller
 * distinguish "this code does not exist" from "you have been throttled" from
 * "that code is the wrong shape". Any such difference would be an enumeration
 * oracle. There is exactly one negative response, and it says nothing specific.
 *
 * PRIVACY: never log the reference code or any case content.
 */

const { getCaseByReferenceCode } = require('../services/statusService');

// The single generic negative response. Reused for not-found, rate-limited, and
// malformed-code so all three are byte-for-byte identical.
const NOT_FOUND_STATUS = 404;
const NOT_FOUND_BODY = {
  success: false,
  message:
    'No case matches that reference code. Check the code and try again, or try later.',
};

/**
 * GET /api/status/:reference_code — anonymous status + reporter-visible notes.
 */
async function getStatus(req, res) {
  // Rate-limit breach is surfaced by the middleware as a flag, not its own
  // response, so we can answer with the SAME generic 404 as a miss. Checked
  // first, before we ever touch the database, so a throttled caller cannot even
  // cause a lookup.
  if (req.isRateLimited) {
    return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
  }

  const referenceCode = req.params.reference_code;

  // Basic shape check only. A malformed code yields the SAME generic 404 — we do
  // not return a distinct validation error, because a structured error would
  // leak how codes are shaped and act as an oracle.
  if (typeof referenceCode !== 'string' || referenceCode.trim() === '') {
    return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
  }

  try {
    const data = await getCaseByReferenceCode(referenceCode);

    if (!data) {
      return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
    }

    return res.json({ success: true, data });
  } catch (err) {
    // A real server/database error. Log a non-sensitive message only (never the
    // reference code), and return a generic 500 — distinct from the 404 because
    // this is not an enumeration signal, it is an outage.
    console.error('Unexpected error during status lookup:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not look up the case right now. Please try again.',
    });
  }
}

module.exports = { getStatus, NOT_FOUND_BODY, NOT_FOUND_STATUS };
