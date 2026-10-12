-- =====================================================================
-- Migration 008 — expand case_reports with optional details + lock down RLS
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- WHY:
-- 1. Adds the 17 optional reporting fields collected by the 5-step reporting
--    wizard (reporter_type, custom_category, title, people_involved,
--    victim_information, incident_date_approximate, incident_time,
--    incident_time_approximate, location_name, evidence_description,
--    other_witnesses, witness_details, immediate_risk, previously_reported,
--    previous_report_details, assistance_requested, additional_information).
--    All optional fields are NULLABLE or have safe defaults so data minimisation
--    is respected.
-- 2. Keeps Row Level Security ENABLED on case_reports with no public policies.
--    The server (service_role key) is the only client and bypasses RLS; the
--    anon key must never read case data directly. See section 2 below.
-- =====================================================================

-- 1. Add all optional columns to case_reports if they do not already exist
ALTER TABLE case_reports
    ADD COLUMN IF NOT EXISTS reporter_type TEXT DEFAULT 'prefer_not_to_say'
        CHECK (reporter_type IS NULL OR reporter_type IN ('victim', 'witness', 'third_party', 'informed', 'prefer_not_to_say')),
    ADD COLUMN IF NOT EXISTS custom_category TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS people_involved TEXT,
    ADD COLUMN IF NOT EXISTS victim_information TEXT,
    ADD COLUMN IF NOT EXISTS incident_date_approximate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS incident_time TEXT,
    ADD COLUMN IF NOT EXISTS incident_time_approximate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS location_name TEXT,
    ADD COLUMN IF NOT EXISTS evidence_description TEXT,
    ADD COLUMN IF NOT EXISTS other_witnesses TEXT
        CHECK (other_witnesses IS NULL OR other_witnesses IN ('yes', 'no', 'not_sure')),
    ADD COLUMN IF NOT EXISTS witness_details TEXT,
    ADD COLUMN IF NOT EXISTS immediate_risk TEXT
        CHECK (immediate_risk IS NULL OR immediate_risk IN ('yes', 'no', 'not_sure')),
    ADD COLUMN IF NOT EXISTS previously_reported TEXT
        CHECK (previously_reported IS NULL OR previously_reported IN ('none', 'police', 'ngo', 'government', 'school', 'workplace', 'other', 'prefer_not_to_say')),
    ADD COLUMN IF NOT EXISTS previous_report_details TEXT,
    ADD COLUMN IF NOT EXISTS assistance_requested TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS additional_information TEXT;

-- 2. Lock down Row Level Security (RLS)
--
-- SECURITY (anonymity rule): the ONLY writer/reader of case_reports is the API
-- server, which uses the Supabase service_role key — that key bypasses RLS by
-- design, so the server is never blocked. Reporters never talk to Supabase
-- directly; they go through the server, which strips internal notes server-side
-- and returns exactly one case by reference code (see CLAUDE.md authorization
-- matrix: "List cases | Anonymous = NEVER").
--
-- Therefore case_reports must have RLS ENABLED with NO policy granting the anon
-- / public role access. The anon key ships inside the mobile app; a permissive
-- "USING (true)" SELECT policy — or disabling RLS — would let anyone holding
-- that key read every narrative, victim detail, evidence path and internal note
-- straight from the database. Never add such a policy here.
ALTER TABLE case_reports ENABLE ROW LEVEL SECURITY;

-- Remove any permissive policies a previous run of this migration may have left
-- behind, so re-running it closes the hole rather than leaving it open.
DROP POLICY IF EXISTS "Allow anonymous report submission" ON case_reports;
DROP POLICY IF EXISTS "Allow read case reports" ON case_reports;

-- Reload PostgREST schema cache so it picks up the new columns immediately
NOTIFY pgrst, 'reload schema';
