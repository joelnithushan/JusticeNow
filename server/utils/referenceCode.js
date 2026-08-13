/**
 * JusticeNow — Reference code generator.
 *
 * The reference code is the anonymous reporter's ONLY handle on their case,
 * so it must be:
 *  - unguessable (cryptographically random, not sequential)
 *  - easy to write down (no ambiguous characters like O/0 or I/1)
 */

const crypto = require('crypto');

// Uppercase alphanumerics with O, 0, I and 1 removed (32 characters).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 10; // fits the VARCHAR(12) column with room to spare

/**
 * Generate one random reference code, e.g. "K7XPMR2QWD".
 * Uses crypto.randomInt so codes cannot be predicted.
 */
function generateReferenceCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

module.exports = { generateReferenceCode, ALPHABET, CODE_LENGTH };
