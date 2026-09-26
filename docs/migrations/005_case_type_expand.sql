-- =====================================================================
-- Migration 005 — expand the case_type CHECK constraint
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- WHY: the app now offers 15 case categories (see CASE_TYPES in
-- server/constants.js — the shared source of truth), but the original
-- case_reports.case_type CHECK only allowed the first 6. A reporter who
-- picked any of the newer categories (violence, domestic_violence,
-- sexual_abuse, child_protection, corruption, abuse_of_authority,
-- human_rights_violation, workplace_abuse, cyber_harassment) passed
-- server validation but was then rejected by the database, so the report
-- silently failed to save. This aligns the DB backstop with the code.
--
-- Safe to re-run: drops the old constraint if present, then re-adds it.
-- =====================================================================

ALTER TABLE case_reports
    DROP CONSTRAINT IF EXISTS case_reports_case_type_check;

ALTER TABLE case_reports
    ADD CONSTRAINT case_reports_case_type_check
    CHECK (case_type IN ('harassment','violence','domestic_violence',
        'sexual_abuse','discrimination','child_protection','corruption',
        'abuse_of_authority','human_rights_violation','workplace_abuse',
        'cyber_harassment','unlawful_detention','land_dispute',
        'official_misconduct','other'));
