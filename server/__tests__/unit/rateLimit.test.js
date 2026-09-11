/**
 * Unit tests — in-memory per-IP rate limiter.
 *
 * The limiter is the security backstop for the anonymous status endpoint: it
 * throttles brute-force enumeration of reference codes. These tests pin down
 * (a) counting within a window, (b) that a breach flags req.isRateLimited
 * rather than sending its own response (so the controller can keep the
 * no-oracle contract), and (c) that the window resets after it elapses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter, DEFAULT_MAX_ATTEMPTS } from '../../middleware/rateLimit.js';

// A minimal Express-like req/res/next harness.
function run(limiter, ip) {
  const req = { ip };
  const res = {};
  const next = vi.fn();
  limiter(req, res, next);
  return { req, next };
}

describe('createRateLimiter — counting within a window', () => {
  it('allows up to maxAttempts without flagging, then flags subsequent attempts', () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });

    // Attempts 1..3 are within the cap: not flagged.
    for (let i = 0; i < 3; i++) {
      const { req, next } = run(limiter, '10.0.0.1');
      expect(req.isRateLimited).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    }

    // Attempt 4 exceeds the cap: flagged, but still calls next() so the
    // controller (not the middleware) emits the identical generic response.
    const { req, next } = run(limiter, '10.0.0.1');
    expect(req.isRateLimited).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it('tracks each IP independently', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    const first = run(limiter, '1.1.1.1');
    expect(first.req.isRateLimited).toBeUndefined();

    // A different IP starts its own fresh count and is not affected.
    const other = run(limiter, '2.2.2.2');
    expect(other.req.isRateLimited).toBeUndefined();

    // The first IP's second attempt exceeds its cap of 1.
    const firstAgain = run(limiter, '1.1.1.1');
    expect(firstAgain.req.isRateLimited).toBe(true);
  });

  it('uses a sane default cap', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(10);
  });
});

describe('createRateLimiter — window reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets the count after the window elapses', () => {
    const windowMs = 15 * 60 * 1000;
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs });

    // Exhaust the window.
    run(limiter, '9.9.9.9');
    run(limiter, '9.9.9.9');
    const overLimit = run(limiter, '9.9.9.9');
    expect(overLimit.req.isRateLimited).toBe(true);

    // Advance time past the window — the entry should be considered expired and
    // the next attempt starts a fresh count.
    vi.advanceTimersByTime(windowMs + 1);
    const afterReset = run(limiter, '9.9.9.9');
    expect(afterReset.req.isRateLimited).toBeUndefined();
  });
});
