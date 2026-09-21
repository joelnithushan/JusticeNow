-- =====================================================================
-- Migration 004 — staff two-factor authentication (TOTP)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Adds TOTP-based 2FA to staff_users. Reporters never authenticate, so this
-- touches ONLY staff accounts — the accounts that can read case narratives,
-- evidence and internal notes, which is exactly what warrants a second factor.
--
--  - totp_secret       : the base32 TOTP secret, set at enrollment. NULL until
--                        a staff member starts enrollment. NEVER logged or
--                        returned to any client after enrollment.
--  - mfa_enabled       : becomes TRUE only once the staff member has verified a
--                        code from their authenticator (proves the secret works).
--  - mfa_backup_codes  : JSON array of BCRYPT-HASHED single-use recovery codes
--                        (for a lost device). Plaintext codes are shown to the
--                        user exactly once at enrollment and never stored.
-- =====================================================================

ALTER TABLE staff_users
    ADD COLUMN IF NOT EXISTS totp_secret      TEXT,
    ADD COLUMN IF NOT EXISTS mfa_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
