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
    -- organisation_id + role are NULLABLE: a Google-SSO sign-up arrives with
    -- neither and chooses them on the profile page during onboarding (the role is
    -- then locked). password_hash is NULLABLE for the same reason — a Google
    -- account authenticates via OAuth and has no password.
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255),
    role            VARCHAR(20)
                    CHECK (role IS NULL OR role IN ('attorney', 'officer', 'admin', 'org_admin')),
    -- Onboarding lifecycle: onboarding → pending → approved/rejected. An account
    -- can log in while onboarding/pending but has NO case access until 'approved'
    -- (see middleware/auth.requireApproved). Admin-created accounts start approved.
    access_status   TEXT NOT NULL DEFAULT 'onboarding'
                    CHECK (access_status IN ('onboarding', 'pending', 'approved', 'rejected')),
    -- Role-aware Sri Lankan profile details (collected at registration / profile).
    nic             TEXT,
    phone           TEXT,
    designation     TEXT,
    bar_number      TEXT,   -- attorneys
    department      TEXT,   -- officers
    gender          TEXT,   -- derived from the NIC
    date_of_birth   DATE,   -- derived from the NIC
    profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    -- Soft-delete flag (U11). Staff are NEVER hard-deleted: audit_log.actor_id
    -- references this row (ON DELETE SET NULL), so a hard delete would strip the
    -- actor from every audit entry that person ever wrote. Deactivating instead
    -- blocks login (see services/auth.js) while preserving the audit trail.
    -- Added by docs/migrations/002_staff_is_active.sql for existing databases.
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Two-factor auth (PR #48). Staff MAY enable a second factor; mfa_enabled stays
    -- FALSE until the factor is proven (see services/mfa.js). mfa_method selects the
    -- factor and is read on EVERY login (services/auth.js) — omitting it breaks login.
    -- TOTP stores a base32 secret; email OTP stores a short-lived hash + expiry.
    -- Backup codes are stored hashed. Reporters are unaffected — they never authenticate.
    totp_secret          TEXT,
    mfa_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_method           TEXT NOT NULL DEFAULT 'totp' CHECK (mfa_method IN ('totp', 'email')),
    email_otp_hash       TEXT,
    email_otp_expires_at TIMESTAMPTZ,
    mfa_backup_codes     JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Self-service password reset (email code): only the bcrypt hash of the 6-digit
    -- code + its expiry are stored; the plaintext is emailed in transit only.
    pw_reset_hash        TEXT,
    pw_reset_expires_at  TIMESTAMPTZ,
    -- Admin moderation (migration 007). SUSPEND (reversible) + soft-DELETE, each
    -- WITH a reason the admin UI shows. Both also set is_active=false so login is
    -- blocked (services/auth.js). A suspended account has suspended_at set; a
    -- deleted account has deleted_at set and is hidden from the admin staff list.
    suspended_at         TIMESTAMPTZ,
    suspension_reason    TEXT,
    deleted_at           TIMESTAMPTZ,
    deletion_reason      TEXT
);

-- Anonymous case reports. Deliberately NO link to any person.
CREATE TABLE case_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code  VARCHAR(12) NOT NULL UNIQUE,
    case_type       VARCHAR(30) NOT NULL
                    -- Must stay in lock-step with CASE_TYPES in server/constants.js
                    -- (the shared source of truth). If they drift, a valid report
                    -- is rejected by the DB backstop instead of by validation.
                    CHECK (case_type IN ('harassment','violence','domestic_violence',
                        'sexual_abuse','discrimination','child_protection','corruption',
                        'abuse_of_authority','human_rights_violation','workplace_abuse',
                        'cyber_harassment','unlawful_detention','land_dispute',
                        'official_misconduct','other')),
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

-- Notes on a case. is_reporter_visible controls whether the note is shown to the
-- anonymous reporter on the Check Status page. `sender` records who wrote it:
-- 'staff' (a case worker) or 'reporter' (a reply the anonymous reporter posted
-- back using only their reference code — author_id NULL, always reporter-visible,
-- and carrying NO reporter identity). See migration 003.
CREATE TABLE case_notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_reports(id) ON DELETE CASCADE,
    author_id           UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    note                TEXT NOT NULL,
    is_reporter_visible BOOLEAN NOT NULL DEFAULT FALSE,
    sender              TEXT NOT NULL DEFAULT 'staff'
                        CHECK (sender IN ('staff', 'reporter')),
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

-- ---------------------------------------------------------------------
-- Audit log
--
-- An append-only trail of staff actions (status changes, note adds,
-- assignments, admin mutations, logins). It exists for accountability, so
-- it records WHO did WHAT and WHEN — never the case contents.
--
-- ANONYMITY / PRIVACY: `detail` must NEVER contain case narrative, evidence
-- paths, reference codes, or any reporter PII (name/email/phone/IP). The audit
-- trail is readable by staff/admins; leaking reporter-linked content here would
-- defeat anonymity by construction. Store only non-sensitive metadata such as
-- the from/to status or the org id involved.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable so an action can outlive the case/actor it referenced;
    -- ON DELETE SET NULL keeps the trail even after the row is removed.
    case_id    UUID REFERENCES case_reports(id) ON DELETE SET NULL,
    actor_id   UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at      ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_case_created    ON audit_log (case_id, created_at DESC);
