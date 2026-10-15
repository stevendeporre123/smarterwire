ALTER TABLE plan ADD COLUMN w REAL;                        -- afmeting tekenvlak (px), blijft bestaan als de foto wordt verwijderd
  ALTER TABLE plan ADD COLUMN h REAL;
  ALTER TABLE plan ADD COLUMN scale REAL;                    -- px per meter
  ALTER TABLE plan ADD COLUMN bg_opacity REAL;               -- 0..1 doorzichtigheid van de foto
  CREATE TABLE shape (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plan(id),
    kind TEXT NOT NULL,                                      -- wall | window | door | stair | furniture | text
    x1 REAL, y1 REAL, x2 REAL, y2 REAL,                      -- px op het tekenvlak
    ref_id TEXT,                                             -- opening: id van de muur
    pos REAL,                                                -- opening: plaats langs de muur (0..1)
    size REAL,                                               -- opening: breedte (m); tekst: lettergrootte (m)
    thick REAL,                                              -- muur: dikte (m)
    flip INTEGER NOT NULL DEFAULT 0,                         -- opening: bit0 = andere kant, bit1 = scharnier andere kant
    rot REAL NOT NULL DEFAULT 0,                             -- trap/meubel: rotatie (graden)
    label TEXT, sub TEXT,                                    -- tekst / meubeltype
    updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_shape_plan ON shape(plan_id);
