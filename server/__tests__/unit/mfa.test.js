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
import { authenticator } from 'otplib';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
// mfa.js -> require('../config/supabase') builds a client at import time, which
// needs these present even though these pure functions never call the DB.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-anon-key';

const {
  verifyTotp,
  generateBackupCodesPlain,
  hashBackupCodes,
  consumeBackupCode,
  signMfaToken,
  BACKUP_CODE_COUNT,
} = await import('../../services/mfa.js');

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
