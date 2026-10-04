-- =====================================================================
-- Migration 007 — staff_users suspend + soft-delete with a reason
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Adds admin moderation of staff accounts:
--   * SUSPEND — temporarily block an account from logging in, WITH a reason.
--     Reversible (unsuspend). Stored as suspended_at + suspension_reason; the
--     account is also set is_active = false so services/auth.js rejects the login
--     (an inactive account is a no-oracle INVALID_CREDENTIALS failure).
--   * DELETE  — soft-delete an account, WITH a reason. Staff are NEVER hard-
--     deleted (audit_log.actor_id references staff_users(id) ON DELETE SET NULL,
--     so a hard delete would strip the actor from every audit entry they wrote).
--     Stored as deleted_at + deletion_reason; is_active is set false and the row
--     is hidden from the admin staff list (deleted_at IS NULL filter).
--
-- A SUSPENDED account has suspended_at set and deleted_at NULL.
-- A DELETED account has deleted_at set (it may also still carry a stale
-- suspended_at, which is ignored once deleted).
-- =====================================================================

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS deletion_reason   TEXT;
