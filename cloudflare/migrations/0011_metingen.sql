-- Meetwaarden bij de keuring: per kring (isolatie, lusimpedantie), per project (aarding) en per differentieel (uitschakeltest).
ALTER TABLE circuit ADD COLUMN insulation_mohm REAL;      -- isolatieweerstand (MΩ)
ALTER TABLE circuit ADD COLUMN loop_ohm REAL;             -- lusimpedantie (Ω)
ALTER TABLE circuit ADD COLUMN measured_at TEXT;          -- datum van de meting (jjjj-mm-dd)
ALTER TABLE project ADD COLUMN earth_ohm REAL;            -- aardingsweerstand (Ω)
ALTER TABLE project ADD COLUMN earth_type TEXT;           -- type aarding (aardingslus, lintaarde, paal…)
ALTER TABLE device ADD COLUMN trip_ma REAL;               -- differentieel: gemeten uitschakelstroom (mA)
ALTER TABLE device ADD COLUMN trip_ms REAL;               -- differentieel: gemeten uitschakeltijd (ms)
