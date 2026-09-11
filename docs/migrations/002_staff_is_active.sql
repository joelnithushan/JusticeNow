-- =====================================================================
-- Migration 002 — staff_users.is_active (soft-delete support, U11)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Adds a soft-delete flag to staff_users. Staff are NEVER hard-deleted:
-- audit_log.actor_id references staff_users(id) ON DELETE SET NULL, so a hard
-- delete would strip the actor from every audit entry that person ever wrote.
-- Deactivating (is_active = false) instead blocks login (see services/auth.js —
-- an inactive account is a no-oracle INVALID_CREDENTIALS failure) while
-- preserving the audit trail.
-- =====================================================================

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
