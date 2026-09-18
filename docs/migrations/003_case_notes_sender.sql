-- =====================================================================
-- Migration 003 — case_notes.sender
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Adds who WROTE each note so a case can carry a two-way thread: staff notes
-- AND replies an anonymous reporter posts back using only their reference code.
--
-- 'reporter' rows are always is_reporter_visible = true and author_id = NULL
-- (there is no staff author, and there is NO reporter identity to record — the
-- reference code stays the only handle, per the anonymity-by-construction rule).
-- Existing rows default to 'staff', which is what every current note is.
-- =====================================================================

ALTER TABLE case_notes
    ADD COLUMN IF NOT EXISTS sender TEXT NOT NULL DEFAULT 'staff'
        CHECK (sender IN ('staff', 'reporter'));
