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

const {
  getCaseByReferenceCode,
  addReporterMessage,
} = require('../services/statusService');
const { REPORTER_MESSAGE_MIN, REPORTER_MESSAGE_MAX } = require('../constants');

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

/**
 * POST /api/status/message — an anonymous reporter posts a reply on their own
 * case, identified only by { reference_code, message }.
 *
 * This is a WRITE keyed on the reference code, so it follows the SAME no-oracle
 * discipline as the lookup: rate-limited by the shared limiter, and a
 * wrong/nonexistent code or a throttled caller both get the IDENTICAL generic
 * 404. The one thing that returns a DISTINCT error is a malformed `message`
 * (400) — but that check is independent of the code, so it cannot reveal whether
 * a code exists and is not an oracle.
 *
 * PRIVACY: never log the reference code or the message body.
 */
async function postMessage(req, res) {
  // Throttled callers are turned away before any DB work — same generic 404.
  if (req.isRateLimited) {
    return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
  }

  const body = req.body || {};
  const referenceCode = body.reference_code;

  // Validate the MESSAGE first. This depends only on the message, never on the
  // code, so a distinct 400 here leaks nothing about which codes exist.
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < REPORTER_MESSAGE_MIN || message.length > REPORTER_MESSAGE_MAX) {
    return res.status(400).json({
      errors: {
        message: `Enter a message between ${REPORTER_MESSAGE_MIN} and ${REPORTER_MESSAGE_MAX} characters.`,
      },
    });
  }

  // A missing/blank code gets the SAME generic 404 as a wrong one — no oracle.
  if (typeof referenceCode !== 'string' || referenceCode.trim() === '') {
    return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
  }

  try {
    const created = await addReporterMessage(referenceCode, message);

    // No case for that code — indistinguishable from rate-limited by design.
    if (!created) {
      return res.status(NOT_FOUND_STATUS).json(NOT_FOUND_BODY);
    }

    return res.status(201).json({ success: true, data: { note: created } });
  } catch (err) {
    // Real outage, not an enumeration signal — generic 500, no code/message logged.
    console.error('Unexpected error posting reporter message:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not send your message right now. Please try again.',
    });
  }
}

module.exports = { getStatus, postMessage, NOT_FOUND_BODY, NOT_FOUND_STATUS };
