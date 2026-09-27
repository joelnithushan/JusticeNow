/**
 * Unit tests — staff two-factor auth (TOTP) pure crypto (services/mfa.js).
 *
 * These four exports are pure/crypto-only — no DB is touched — so unlike the
 * integration suite we do NOT stub fetch or mock supabase here. We DO use the
 * real `otplib` (the same library the service uses) to mint live TOTP codes, and
 * real bcryptjs for the backup-code hashes, so the compare/verify paths are
 * genuinely exercised. JWT_SECRET must be set before the module is imported (the
 * service reads it at import time, mirroring services/auth.js).
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
// mfa.js -> require('../config/supabase') builds a client at import time, which
// needs these present even though these pure functions never call the DB.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

const {
  verifyTotp,
  generateEmailOtp,
  verifyEmailOtp,
  generateBackupCodesPlain,
  hashBackupCodes,
  consumeBackupCode,
  signMfaToken,
  BACKUP_CODE_COUNT,
  MFA_METHODS,
} = await import('../../services/mfa.js');

// A timestamp comfortably in the future / past, for OTP expiry assertions.
const FUTURE = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

describe('verifyTotp', () => {
  it('accepts a live code generated from the same secret', () => {
    const secret = authenticator.generateSecret();
    const liveCode = authenticator.generate(secret);
    expect(verifyTotp(secret, liveCode)).toBe(true);
  });

  it('rejects a wrong 6-digit code', () => {
    const secret = authenticator.generateSecret();
    const liveCode = authenticator.generate(secret);
    // Pick a different 6-digit code than the live one so the assertion is stable.
    const wrong = liveCode === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('rejects a non-6-digit string, an empty string, and a null secret', () => {
    const secret = authenticator.generateSecret();
    // Not exactly six digits → rejected before otplib is even asked.
    expect(verifyTotp(secret, '12345')).toBe(false); // too short
    expect(verifyTotp(secret, '1234567')).toBe(false); // too long
    expect(verifyTotp(secret, 'abcdef')).toBe(false); // non-numeric
    expect(verifyTotp(secret, '')).toBe(false); // empty
    // A null secret can never verify, even with a well-formed code.
    expect(verifyTotp(null, authenticator.generate(secret))).toBe(false);
  });
});

describe('generateEmailOtp', () => {
  it('returns a 6-digit numeric string (zero-padded)', () => {
    // Run several times: a small value must still be padded to six characters.
    for (let i = 0; i < 50; i += 1) {
      const code = generateEmailOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('verifyEmailOtp', () => {
  it('accepts the correct code before it expires', async () => {
    const code = '123456';
    const hash = await bcrypt.hash(code, 10);
    expect(await verifyEmailOtp(hash, FUTURE, code)).toBe(true);
  });

  it('rejects the correct code once it has expired', async () => {
    const code = '123456';
    const hash = await bcrypt.hash(code, 10);
    // Right digits, but past the expiry instant → still a miss.
    expect(await verifyEmailOtp(hash, PAST, code)).toBe(false);
  });

  it('rejects a wrong code, and a null hash/expiry', async () => {
    const hash = await bcrypt.hash('123456', 10);
    expect(await verifyEmailOtp(hash, FUTURE, '000000')).toBe(false);
    expect(await verifyEmailOtp(null, FUTURE, '123456')).toBe(false);
    expect(await verifyEmailOtp(hash, null, '123456')).toBe(false);
  });

  it('rejects a non-6-digit submission before hashing', async () => {
    const hash = await bcrypt.hash('123456', 10);
    expect(await verifyEmailOtp(hash, FUTURE, '12345')).toBe(false);
    expect(await verifyEmailOtp(hash, FUTURE, 'abcdef')).toBe(false);
    expect(await verifyEmailOtp(hash, FUTURE, '')).toBe(false);
  });

  it('ignores surrounding whitespace in the submission', async () => {
    const code = '654321';
    const hash = await bcrypt.hash(code, 10);
    expect(await verifyEmailOtp(hash, FUTURE, '  654321  ')).toBe(true);
  });
});

describe('MFA_METHODS', () => {
  it('is exactly the two supported second factors', () => {
    expect(MFA_METHODS).toEqual(['totp', 'email']);
  });
});

describe('generateBackupCodesPlain', () => {
  it('returns BACKUP_CODE_COUNT (8) distinct codes', () => {
    const codes = generateBackupCodesPlain();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(BACKUP_CODE_COUNT).toBe(8);
    // All distinct — a duplicate would silently halve the usable set.
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
  });
});

describe('hashBackupCodes + consumeBackupCode', () => {
  it('matches a correct plaintext and removes exactly that code (single-use)', async () => {
    const plain = generateBackupCodesPlain();
    const hashed = await hashBackupCodes(plain);
    expect(hashed).toHaveLength(BACKUP_CODE_COUNT);

    const { matched, remaining } = await consumeBackupCode(hashed, plain[2]);
    expect(matched).toBe(true);
    // The consumed hash is dropped so the code cannot be reused.
    expect(remaining).toHaveLength(BACKUP_CODE_COUNT - 1);
    // The used code no longer matches anything left in `remaining`.
    const second = await consumeBackupCode(remaining, plain[2]);
    expect(second.matched).toBe(false);
    expect(second.remaining).toHaveLength(BACKUP_CODE_COUNT - 1);
  });

  it('returns matched:false and unchanged remaining for a wrong code', async () => {
    const plain = generateBackupCodesPlain();
    const hashed = await hashBackupCodes(plain);

    const { matched, remaining } = await consumeBackupCode(hashed, 'NOPE1-NOPE2');
    expect(matched).toBe(false);
    // Nothing is consumed on a miss.
    expect(remaining).toEqual(hashed);
  });

  it('matches case-insensitively and trims surrounding whitespace', async () => {
    const plain = generateBackupCodesPlain();
    const hashed = await hashBackupCodes(plain);

    // Same code, lowercased and padded — must still match (consumeBackupCode
    // upper-cases + trims the submission before comparing).
    const messy = `  ${plain[0].toLowerCase()}  `;
    const { matched, remaining } = await consumeBackupCode(hashed, messy);
    expect(matched).toBe(true);
    expect(remaining).toHaveLength(BACKUP_CODE_COUNT - 1);
  });
});

describe('signMfaToken', () => {
  it('produces a pending-MFA JWT carrying mfa:"pending" and the given sub', () => {
    const token = signMfaToken('staff-123');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.mfa).toBe('pending');
    expect(decoded.sub).toBe('staff-123');
  });
});
