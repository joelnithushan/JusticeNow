/**
 * JusticeNow — Reference code generator.
 *
 * The reference code is the anonymous reporter's ONLY handle on their case,
 * so it must be:
 *  - unguessable (cryptographically random, not sequential), and
 *  - easy to read back and write down (no characters that look alike).
 *
 * WHY the ambiguous characters are removed: a reporter often copies this code
 * onto paper under stress, then types it back later. If the alphabet contained
 * O/0, I/1 or L, a mis-copied code would silently point at the wrong case (or
 * none), and there is no account or email we can fall back on to recover it.
 */

const crypto = require('crypto');

// Human-friendly prefix so a reporter can recognise the code as a JusticeNow
// case reference and not mistake it for something else.
const PREFIX = 'JN-';

// Uppercase letters and digits with every ambiguous glyph removed:
// O and 0, I and 1, and L. Do not add these back.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Length of the random part. PREFIX (3) + BODY (8) = 11 chars, which fits the
// reference_code VARCHAR(12) column with room to spare.
const BODY_LENGTH = 8;

/**
 * Generate one random reference code, e.g. "JN-K7XPMR2Q".
 * Uses crypto.randomInt (not Math.random) so codes cannot be predicted.
 */
function generateReferenceCode() {
  let body = '';
  for (let i = 0; i < BODY_LENGTH; i++) {
    body += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}

/**
 * Generate a code that does not already exist.
 *
 * @param {(code: string) => Promise<boolean>} exists  async predicate that
 *        resolves true if the code is already taken (e.g. a DB lookup).
 * @param {number} maxAttempts  how many codes to try before giving up.
 * @returns {Promise<string>} a code for which `exists` returned false.
 * @throws if a free code was not found within maxAttempts.
 *
 * Collisions are astronomically unlikely, but the reference_code column has a
 * UNIQUE constraint, so we must be able to retry rather than hand a reporter a
 * code that fails to insert.
 */
async function generateUniqueCode(exists, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferenceCode();
    // eslint-disable-next-line no-await-in-loop -- attempts must be sequential
    if (!(await exists(code))) {
      return code;
    }
  }
  throw new Error('Could not generate a unique reference code');
}

module.exports = {
  generateReferenceCode,
  generateUniqueCode,
  PREFIX,
  ALPHABET,
  BODY_LENGTH,
};
