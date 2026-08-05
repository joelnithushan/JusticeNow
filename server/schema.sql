-- =============================================================================
-- Community Hazard Alert & Response System - PostgreSQL Schema (Supabase DDL)
-- Project Group: SPM_NU_WE_01
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- =============================================================================

-- Enable extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Uncomment to reset the database during development (DESTROYS ALL DATA):
-- DROP TABLE IF EXISTS sos, alerts, hazard_reports, users CASCADE;

-- 1. USERS TABLE
-- Registration/login credentials + home area (for area-based alert targeting)
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    district      VARCHAR(50),           -- e.g. 'Colombo', 'Kandy', 'Ratnapura'
    ds_division   VARCHAR(50),           -- Divisional Secretariat division
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. HAZARD_REPORTS TABLE
-- Citizen-submitted hazard sightings shown on the map, pending admin review
CREATE TABLE hazard_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('dengue','flood','heat','landslide')),
    latitude    DECIMAL(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude   DECIMAL(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    severity    VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high')),
    description TEXT,
    status      VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ALERTS TABLE
-- Area-wide warnings triggered by report thresholds or weather signals.
-- No FK to reports/users: matched logically by (district, ds_division, type).
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district    VARCHAR(50) NOT NULL,
    ds_division VARCHAR(50),             -- NULL = district-wide alert
    type        VARCHAR(20) NOT NULL CHECK (type IN ('dengue','flood','heat','landslide')),
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. SOS TABLE
-- Emergency distress signals with live GPS location for rescue dispatch
CREATE TABLE sos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude   DECIMAL(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude  DECIMAL(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    status     VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_reports_status   ON hazard_reports(status);
CREATE INDEX idx_reports_type     ON hazard_reports(type);
CREATE INDEX idx_reports_location ON hazard_reports(latitude, longitude);
CREATE INDEX idx_sos_status       ON sos(status);
CREATE INDEX idx_sos_location     ON sos(latitude, longitude);
CREATE INDEX idx_alerts_district  ON alerts(district);

-- =============================================================================
-- SAMPLE DATA (for development & demos)
-- All sample accounts share the password: Password123!
-- =============================================================================

INSERT INTO users (id, name, email, password_hash, district, ds_division)
VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Joel Nithushan', 'joel@example.lk',       '$2b$10$QPeWmarv2.yhFAeQHowZj.G.JX3m1nwvEq0GjQraPLiSsgymBsHbq', 'Colombo',   'Thimbirigasyaya'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Vaishnavi L',    'vaishnavi@example.lk',  '$2b$10$QPeWmarv2.yhFAeQHowZj.G.JX3m1nwvEq0GjQraPLiSsgymBsHbq', 'Kandy',     'Gangawata Korale'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Thushalini U',   'thushalini@example.lk', '$2b$10$QPeWmarv2.yhFAeQHowZj.G.JX3m1nwvEq0GjQraPLiSsgymBsHbq', 'Galle',     'Four Gravets'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Kanistan T',     'kanistan@example.lk',   '$2b$10$QPeWmarv2.yhFAeQHowZj.G.JX3m1nwvEq0GjQraPLiSsgymBsHbq', 'Ratnapura', 'Ratnapura')
ON CONFLICT (email) DO NOTHING;

INSERT INTO hazard_reports (reporter_id, type, latitude, longitude, severity, description, status)
VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'flood',     6.927100, 79.861200, 'high',   'Kelani river overflowing. Water level rising rapidly near Kelanimulla.',        'confirmed'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'landslide', 6.682800, 80.399200, 'high',   'Earth slip reported along Ratnapura-Balangoda main road. Traffic blocked.',     'pending'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'dengue',    7.290600, 80.633700, 'medium', 'Increased mosquito breeding spots identified around Kandy market region.',      'confirmed'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'heat',      6.053500, 80.221000, 'low',    'Unusually high temperatures reported around Galle Fort area.',                  'pending');

INSERT INTO alerts (district, ds_division, type, message)
VALUES
    ('Colombo',   'Thimbirigasyaya', 'flood',     'Flood warning: Kelani river levels critical. Residents in low-lying areas should move to higher ground.'),
    ('Ratnapura', NULL,              'landslide', 'District-wide landslide risk alert issued after continuous heavy rainfall. Avoid slopes and embankments.');

INSERT INTO sos (user_id, latitude, longitude, status)
VALUES
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 6.685000, 80.401000, 'active');
