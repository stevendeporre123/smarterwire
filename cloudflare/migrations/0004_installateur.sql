ALTER TABLE project ADD COLUMN supply_amp REAL;            -- bv. 20 voor "20A Voeding - 4 polig"
  ALTER TABLE project ADD COLUMN inspector_info TEXT;        -- adres en contact van de keuringsinstelling
  CREATE TABLE setting (id TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0);
