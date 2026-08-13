-- =====================================================================
-- JusticeNow — Database Schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- ANONYMITY BY CONSTRUCTION:
-- case_reports has NO foreign key to any user record, and no name/email/
-- phone columns. The reference_code is the reporter's ONLY handle.
-- Do not add reporter identity columns to case_reports.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Legal aid organisations and NGOs that receive and handle cases.
CREATE TABLE organisations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150) NOT NULL,
    description   TEXT,
    district      VARCHAR(50) NOT NULL,
    case_types    TEXT[] NOT NULL DEFAULT '{}',
    contact_phone VARCHAR(30),
    contact_email VARCHAR(150),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff (attorneys, advocacy officers, admins). The ONLY people who log in.
CREATE TABLE staff_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'officer'
                    CHECK (role IN ('attorney', 'officer', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anonymous case reports. Deliberately NO link to any person.
CREATE TABLE case_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code  VARCHAR(12) NOT NULL UNIQUE,
    case_type       VARCHAR(30) NOT NULL
                    CHECK (case_type IN ('harassment','unlawful_detention',
                        'land_dispute','discrimination','official_misconduct','other')),
    incident_date   DATE,
    district        VARCHAR(50) NOT NULL,
    description     TEXT NOT NULL,
    evidence_path   TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','under_review','referred','closed')),
    assigned_org_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff notes on a case. is_reporter_visible controls whether the note is
-- shown to the anonymous reporter on the Check Status page.
CREATE TABLE case_notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_reports(id) ON DELETE CASCADE,
    author_id           UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    note                TEXT NOT NULL,
    is_reporter_visible BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX idx_case_reports_status       ON case_reports (status);
CREATE INDEX idx_case_reports_case_type    ON case_reports (case_type);
CREATE INDEX idx_case_reports_district     ON case_reports (district);
CREATE INDEX idx_case_reports_created_at   ON case_reports (created_at DESC);
CREATE INDEX idx_case_reports_assigned_org ON case_reports (assigned_org_id);
CREATE INDEX idx_case_notes_case_created   ON case_notes (case_id, created_at DESC);
CREATE INDEX idx_organisations_district    ON organisations (district);
CREATE INDEX idx_organisations_case_types  ON organisations USING GIN (case_types);
