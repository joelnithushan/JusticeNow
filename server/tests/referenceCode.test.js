/**
 * JusticeNow — Unit tests for the reference code generator.
 * (TC-RC-01 .. TC-RC-04 in TEST_CASES.md)
 *
 * These are pure unit tests — no database needed, so they always run.
 * API integration tests against Supabase will be added once the team's
 * shared Supabase project is provisioned (next sprint).
 */

const { generateReferenceCode, ALPHABET, CODE_LENGTH } = require('../utils/referenceCode');

describe('generateReferenceCode', () => {
  // TC-RC-01: correct length
  test('generates a code of the expected length', () => {
    expect(generateReferenceCode()).toHaveLength(CODE_LENGTH);
  });

  // TC-RC-02: fits the VARCHAR(12) column
  test('code length fits the reference_code column (max 12)', () => {
    expect(CODE_LENGTH).toBeGreaterThanOrEqual(8);
    expect(CODE_LENGTH).toBeLessThanOrEqual(12);
  });

  // TC-RC-03: only unambiguous uppercase alphanumerics
  test('never contains ambiguous characters (O, 0, I, 1) or lowercase', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateReferenceCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  // TC-RC-04: codes are effectively unique
  test('1000 generated codes are all distinct', () => {
    const codes = new Set();
    for (let i = 0; i < 1000; i++) {
      codes.add(generateReferenceCode());
    }
    expect(codes.size).toBe(1000);
  });
});
