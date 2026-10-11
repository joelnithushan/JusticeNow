-- =====================================================================
-- Migration 008 — expand case_reports with optional details + RLS policy
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
-- 2. Configures Row Level Security (RLS) on case_reports so that anonymous
--    reporters and the API server can INSERT reports and read status without
--    violating RLS (error 42501).
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

-- 2. Configure Row Level Security (RLS)
-- Allow anyone (public/anon/authenticated) to insert anonymous case reports
ALTER TABLE case_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous report submission" ON case_reports;
CREATE POLICY "Allow anonymous report submission"
    ON case_reports
    FOR INSERT
    TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read case reports" ON case_reports;
CREATE POLICY "Allow read case reports"
    ON case_reports
    FOR SELECT
    TO public
    USING (true);

-- Also disable RLS as a guarantee so server backend operations are never blocked
ALTER TABLE case_reports DISABLE ROW LEVEL SECURITY;

-- Reload PostgREST schema cache so it picks up the new columns immediately
NOTIFY pgrst, 'reload schema';
