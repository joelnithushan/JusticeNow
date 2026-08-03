-- =============================================================================
-- Community Hazard Alert & Response System - PostgreSQL Schema (Supabase DDL)
-- Project Group: SPM_NU_WE_01
-- =============================================================================

-- Enable UUID extension for unique primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
-- Stores citizen and administrator profile credentials and location info in Sri Lanka
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    district VARCHAR(100) NOT NULL,    -- e.g., 'Colombo', 'Kandy', 'Galle', 'Ratnapura'
    ds_division VARCHAR(100) NOT NULL, -- Divisional Secretariat Division
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. HAZARD_REPORTS TABLE
-- Stores hazard reports logged by citizens (Floods, Dengue, Landslides, Heavy Storms, etc.)
CREATE TABLE IF NOT EXISTS hazard_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,        -- e.g., 'Flood', 'Landslide', 'Dengue Outbreak', 'Heavy Rain'
    latitude NUMERIC(10, 7) NOT NULL,  -- Geolocation latitude (e.g., 6.9271)
    longitude NUMERIC(10, 7) NOT NULL, -- Geolocation longitude (e.g., 79.8612)
    severity VARCHAR(50) NOT NULL,     -- 'Low', 'Medium', 'High', 'Critical'
    description TEXT,                  -- Details of the hazard
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. SOS TABLE
-- Emergency distress calls sent by citizens requiring immediate rescue/assistance
CREATE TABLE IF NOT EXISTS sos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL,  -- Real-time latitude location
    longitude NUMERIC(10, 7) NOT NULL, -- Real-time longitude location
    status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'RESPONDED', 'RESOLVED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR FAST QUERYING
CREATE INDEX IF NOT EXISTS idx_hazard_reports_type ON hazard_reports(type);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_created_at ON hazard_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_status ON sos(status);

-- =============================================================================
-- SAMPLE DATA (For initial development & demonstration)
-- =============================================================================

-- Insert sample users
INSERT INTO users (id, name, email, password, district, ds_division)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Joel Nithushan', 'joel@example.lk', 'hashedpassword123', 'Colombo', 'Thimbirigasyaya'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Vaishnavi L', 'vaishnavi@example.lk', 'hashedpassword123', 'Kandy', 'Gangawata Korale'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Thushalini U', 'thushalini@example.lk', 'hashedpassword123', 'Galle', 'Four Gravets'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Kanistan T', 'kanistan@example.lk', 'hashedpassword123', 'Ratnapura', 'Ratnapura')
ON CONFLICT (email) DO NOTHING;

-- Insert sample hazard reports across Sri Lanka
INSERT INTO hazard_reports (type, latitude, longitude, severity, description, reporter_id)
VALUES
    ('Flood', 6.9271, 79.8612, 'High', 'Kelani river overflowing. Water level rising rapidly near Kelanimulla.', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('Landslide', 6.6828, 80.3992, 'Critical', 'Earth slip reported along Ratnapura-Balangoda main road. Traffic blocked.', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'),
    ('Dengue Outbreak', 7.2906, 80.6337, 'Medium', 'Increased mosquito breeding spots identified around Kandy market region.', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('Heavy Rain', 6.0535, 80.2210, 'Low', 'Continuous heavy rains experiencing near Galle Fort area.', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33');

-- Insert sample SOS alert
INSERT INTO sos (user_id, latitude, longitude, status)
VALUES
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 6.6850, 80.4010, 'ACTIVE');
