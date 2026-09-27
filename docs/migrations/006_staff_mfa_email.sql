-- =====================================================================
-- Migration 006 — email-based 2FA option for staff
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- WHY: staff can already use an authenticator app (TOTP, migration 004). Some
-- staff have no second device handy, so we add a second CHOICE: a one-time code
-- emailed to the staff member's address at login. Reporters never authenticate,
-- so this still touches ONLY staff accounts.
--
--  - mfa_method           : which second factor this account uses — 'totp'
--                           (authenticator app, the default) or 'email' (code
--                           sent to their inbox). Chosen at enrollment.
--  - email_otp_hash       : BCRYPT hash of the current email code. NULL when no
--                           code is outstanding. Single-use: cleared the moment a
--                           code is accepted. The plaintext code is NEVER stored.
--  - email_otp_expires_at : when the current email code stops being valid (short
--                           TTL). A code past this instant is rejected.
--
-- PRIVACY: the code itself is never stored or logged — only its hash. Safe to
-- re-run.
-- =====================================================================

ALTER TABLE staff_users
    ADD COLUMN IF NOT EXISTS mfa_method           TEXT NOT NULL DEFAULT 'totp'
                             CHECK (mfa_method IN ('totp', 'email')),
    ADD COLUMN IF NOT EXISTS email_otp_hash       TEXT,
    ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMPTZ;
