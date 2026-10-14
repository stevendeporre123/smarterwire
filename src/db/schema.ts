// Migraties op volgorde. PRAGMA user_version houdt bij welke al gelopen zijn.
// Elke tabel heeft: id (uuid), updated_at (ms), deleted (soft delete) -> klaar voor
// last-write-wins sync met Cloudflare D1 (alles met updated_at > laatste sync pushen).
const SYNC = `updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0`;

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE project (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, client TEXT, inspector TEXT, notes TEXT,
    ${SYNC}
  );
  CREATE TABLE asset (
    id TEXT PRIMARY KEY, mime TEXT NOT NULL, width INTEGER, height INTEGER, data BLOB NOT NULL,
    ${SYNC}
  );
  CREATE TABLE board (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
    name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'bestaand',   -- bestaand | nieuw
    location TEXT, asset_id TEXT REFERENCES asset(id), notes TEXT,
    ${SYNC}
  );
  CREATE TABLE device (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES board(id),
    parent_id TEXT,                       -- beschermd door (differentieel/hoofdschakelaar)
    kind TEXT NOT NULL DEFAULT 'automaat',
    label TEXT, poles TEXT DEFAULT '1P+N', rating_a REAL, curve TEXT, sens_ma REAL, dtype TEXT, breaking_ka REAL,
    row_no INTEGER NOT NULL DEFAULT 0, pos REAL NOT NULL DEFAULT 0, modules INTEGER NOT NULL DEFAULT 1,
    rx REAL, ry REAL, rw REAL, rh REAL,   -- rechthoek op foto (genormaliseerd 0..1)
    notes TEXT,
    ${SYNC}
  );
  CREATE TABLE circuit (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
    nr TEXT, name TEXT NOT NULL, func TEXT,
    device_id TEXT,                       -- zekering in de BESTAANDE kast (meerdere kringen mogen delen!)
    new_device_id TEXT,                   -- zekering in de NIEUWE kast
    voltage INTEGER DEFAULT 230, cable_type TEXT, section_mm2 REAL, wires INTEGER, has_earth INTEGER DEFAULT 1,
    rooms TEXT, status TEXT NOT NULL DEFAULT 'onbekend',  -- onbekend | gedocumenteerd | gecontroleerd
    notes TEXT,
    ${SYNC}
  );
  CREATE TABLE plan (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
    name TEXT NOT NULL, level TEXT, asset_id TEXT REFERENCES asset(id),
    ${SYNC}
  );
  CREATE TABLE symbol (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plan(id),
    type TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL DEFAULT 0,
    circuit_id TEXT, label TEXT, notes TEXT,
    ${SYNC}
  );
  CREATE INDEX idx_board_project ON board(project_id);
  CREATE INDEX idx_device_board ON device(board_id);
  CREATE INDEX idx_circuit_project ON circuit(project_id);
  CREATE INDEX idx_circuit_device ON circuit(device_id);
  CREATE INDEX idx_plan_project ON plan(project_id);
  CREATE INDEX idx_symbol_plan ON symbol(plan_id);
  `,
];
