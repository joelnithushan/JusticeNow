/**
 * Unit tests — reference code generator.
 * Pure logic, no database. Pattern to copy for other unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateReferenceCode,
  generateUniqueCode,
  PREFIX,
  ALPHABET,
  BODY_LENGTH,
} from '../../utils/referenceCode.js';

describe('generateReferenceCode', () => {
  it('has the right length and prefix', () => {
    const code = generateReferenceCode();
    expect(code.startsWith(PREFIX)).toBe(true);
    expect(code).toHaveLength(PREFIX.length + BODY_LENGTH);
    // Whole code fits the reference_code VARCHAR(12) column.
    expect(code.length).toBeLessThanOrEqual(12);
  });

  it('never contains the ambiguous characters O, 0, I, 1 or L', () => {
    // Assert both directions: the alphabet excludes them, and 1000 real codes
    // contain none of them.
    for (const forbidden of ['O', '0', 'I', '1', 'L']) {
      expect(ALPHABET).not.toContain(forbidden);
    }
    for (let i = 0; i < 1000; i++) {
      const body = generateReferenceCode().slice(PREFIX.length);
      expect(body).toMatch(/^[A-HJKMNP-Z2-9]+$/); // no I, no L, no O, no 0/1
    }
  });

  it('produces no duplicates across a large batch', () => {
    const codes = new Set();
    for (let i = 0; i < 5000; i++) {
      codes.add(generateReferenceCode());
    }
    expect(codes.size).toBe(5000);
  });
});

describe('generateUniqueCode', () => {
  it('retries when a collision is reported, then returns a free code', async () => {
    // exists() says "taken" twice, then "free" on the third code.
    const exists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const code = await generateUniqueCode(exists);

    expect(exists).toHaveBeenCalledTimes(3);
    expect(code.startsWith(PREFIX)).toBe(true);
  });

  it('gives up with an error after maxAttempts collisions', async () => {
    const alwaysTaken = vi.fn().mockResolvedValue(true);
    await expect(generateUniqueCode(alwaysTaken, 3)).rejects.toThrow(
      /unique reference code/i,
    );
    expect(alwaysTaken).toHaveBeenCalledTimes(3);
  });
});
