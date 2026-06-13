-- KSP Crime Database Schema
-- This schema defines the structure for the crime database

CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE crime_types (
    id SERIAL PRIMARY KEY,
    ipc_section VARCHAR(20) UNIQUE NOT NULL,
    description VARCHAR(500)
);

CREATE TABLE police_stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    district_id INTEGER REFERENCES districts(id),
    taluk VARCHAR(100)
);

CREATE TABLE crimes (
    id SERIAL PRIMARY KEY,
    fir_number VARCHAR(50) UNIQUE NOT NULL,
    date_occurred DATE NOT NULL,
    district VARCHAR(100),
    taluk VARCHAR(100),
    police_station VARCHAR(100),
    crime_type VARCHAR(100),
    description TEXT,
    latitude FLOAT,
    longitude FLOAT
);

-- Indexes for better query performance
CREATE INDEX idx_crimes_date ON crimes(date_occurred);
CREATE INDEX idx_crimes_district ON crimes(district);
CREATE INDEX idx_crimes_crime_type ON crimes(crime_type);
CREATE INDEX idx_crimes_location ON crimes(district, taluk, police_station);