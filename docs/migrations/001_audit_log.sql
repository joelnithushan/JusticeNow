-- =====================================================================
-- Migration 001 — audit_log
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Append-only trail of staff actions for accountability. It records WHO did
-- WHAT and WHEN — never the case contents.
--
-- ANONYMITY / PRIVACY: `detail` must NEVER contain case narrative, evidence
-- paths, reference codes, or any reporter PII (name/email/phone/IP). Store
-- only non-sensitive metadata (e.g. from/to status, org id).
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID REFERENCES case_reports(id) ON DELETE SET NULL,
    actor_id   UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at   ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_case_created ON audit_log (case_id, created_at DESC);
