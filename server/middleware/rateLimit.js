/**
 * JusticeNow — In-memory per-IP rate limiter.
 *
 * WHY THIS EXISTS (anonymity/safety): the anonymous status endpoint is keyed on
 * a reference code, which is effectively a short guessable password. Without a
 * cap, an attacker could brute-force codes to enumerate other people's cases.
 * This limiter caps attempts per client IP within a rolling window.
 *
 * WHY IN-MEMORY (no new dependency): we deliberately avoid pulling in a store
 * or an npm package. A plain Map keyed by IP is enough for a single process and
 * keeps the dependency surface small.
 *
 * PRIVACY: the IP is used ONLY as a transient map key to count attempts. It is
 * NEVER logged, and NEVER stored on or linked to a case. Reporters are anonymous
 * by construction, so the IP must not leak anywhere — hence no console output of
 * it, and the map entry expires (see resetAt) rather than accumulating a record.
 */

// Default policy: 10 attempts per 15-minute window. Kept modest so a genuine
// reporter mistyping their code a few times is never blocked, while brute-force
// enumeration is throttled hard.
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Build an Express middleware that rate-limits by client IP.
 *
 * The middleware attaches nothing identifying to the request. On limit breach it
 * does NOT send its own distinctive response — instead it flags the request via
 * `req.isRateLimited = true` and calls next(), so the controller can return the
 * SAME generic 404 it uses for "not found". This is the no-oracle rule: a
 * throttled caller and a valid-but-nonexistent code must be indistinguishable.
 *
 * @param {object}  [options]
 * @param {number}  [options.maxAttempts]  attempts allowed per window
 * @param {number}  [options.windowMs]     window length in milliseconds
 * @returns Express middleware
 */
function createRateLimiter({
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS,
} = {}) {
  // ip -> { count, resetAt }. Transient: never persisted, never logged.
  const attempts = new Map();

  return function rateLimit(req, res, next) {
    // req.ip is derived transiently from the socket by Express; we read it here
    // as a map key only and never copy it onto the request, a case, or a log.
    const key = req.ip || 'unknown';
    const now = Date.now();

    const entry = attempts.get(key);

    if (!entry || now >= entry.resetAt) {
      // First attempt, or the previous window has fully elapsed — start fresh.
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > maxAttempts) {
      // Over the limit. Flag it and hand control to the controller, which will
      // emit the identical generic 404 — no distinct status/body from here, so
      // this cannot be used as an oracle.
      req.isRateLimited = true;
    }

    return next();
  };
}

module.exports = { createRateLimiter, DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS };
