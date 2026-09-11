import { describe, it, expect } from 'vitest';
import { decodeNic, isValidNic, isValidLkMobile } from '../../utils/nic.js';

describe('decodeNic — Sri Lankan NIC', () => {
  it('decodes a NEW-format male NIC (12 digits)', () => {
    const r = decodeNic('199010012345'); // 1990, day 100
    expect(r.valid).toBe(true);
    expect(r.gender).toBe('male');
    expect(r.dateOfBirth).toBe('1990-04-09');
  });

  it('decodes a NEW-format female NIC (+500 day offset)', () => {
    const r = decodeNic('199060012345'); // 1990, day 600 → female, day 100
    expect(r.valid).toBe(true);
    expect(r.gender).toBe('female');
    expect(r.dateOfBirth).toBe('1990-04-09');
  });

  it('decodes an OLD-format NIC (9 digits + V), born 19YY', () => {
    const r = decodeNic('751234567V'); // 1975, day 123
    expect(r.valid).toBe(true);
    expect(r.gender).toBe('male');
    expect(r.year).toBe(1975);
  });

  it('accepts lowercase v and the X letter', () => {
    expect(isValidNic('751234567v')).toBe(true);
    expect(isValidNic('751234567X')).toBe(true);
  });

  it('accepts Feb 29 in a LEAP year', () => {
    const r = decodeNic('200006012345'); // 2000 (leap), day 60 → Feb 29
    expect(r.valid).toBe(true);
    expect(r.dateOfBirth).toBe('2000-02-29');
  });

  it('REJECTS Feb 29 in a NON-leap year', () => {
    const r = decodeNic('200106012345'); // 2001 (non-leap), day 60
    expect(r.valid).toBe(false);
    expect(r.error).toBe('leap');
  });

  it('rejects a bad format', () => {
    expect(decodeNic('751234567').valid).toBe(false); // old, missing letter
    expect(decodeNic('12345').valid).toBe(false);
    expect(decodeNic('abcdefghijkl').valid).toBe(false);
  });

  it('rejects an out-of-range day-of-year', () => {
    expect(decodeNic('199000012345').error).toBe('day'); // day 0
    expect(decodeNic('199090012345').error).toBe('day'); // female day 400 > 366
  });
});

describe('isValidLkMobile — Sri Lankan mobile', () => {
  it('accepts local and international forms', () => {
    expect(isValidLkMobile('0771234567')).toBe(true);
    expect(isValidLkMobile('+94771234567')).toBe(true);
    expect(isValidLkMobile('94771234567')).toBe(true);
    expect(isValidLkMobile('074 123 4567')).toBe(true);
  });

  it('rejects malformed numbers', () => {
    expect(isValidLkMobile('077123456')).toBe(false); // too short
    expect(isValidLkMobile('0791234567')).toBe(false); // 079 not allowed (7[0-8])
    expect(isValidLkMobile('12345')).toBe(false);
    expect(isValidLkMobile('abcd')).toBe(false);
  });
});
