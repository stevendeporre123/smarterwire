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
  // v2: keuringsgegevens, verplichte kabelkenmerken, onderverdelers, fases
  `
  ALTER TABLE project ADD COLUMN ean TEXT;
  ALTER TABLE project ADD COLUMN owner TEXT;
  ALTER TABLE project ADD COLUMN supply TEXT;                -- 1x230 | 3N400 | 3x230
  ALTER TABLE circuit ADD COLUMN fire_class TEXT;            -- brandklasse kabel (Eca, Cca, ...)
  ALTER TABLE circuit ADD COLUMN install TEXT;               -- in muur | op muur | in buis | los
  ALTER TABLE circuit ADD COLUMN level TEXT;                 -- verdieping
  ALTER TABLE circuit ADD COLUMN lock_group TEXT;            -- kringen met zelfde waarde blijven samen (bv. gedeelde nul)
  ALTER TABLE circuit ADD COLUMN feeds_board_id TEXT;        -- deze kring voedt een onderverdeler
  ALTER TABLE device ADD COLUMN phase TEXT;                  -- L1 | L2 | L3 | 3P
  ALTER TABLE board ADD COLUMN src_board_id TEXT;            -- nieuwe kast ontstaat uit deze bestaande kast
  ALTER TABLE symbol ADD COLUMN board_id TEXT;               -- verdeelbord-symbool verwijst naar een kast
  `,
  // v3: plan als vectortekening (muren, openingen, trappen, meubilair) met schaal; de foto wordt een achtergrondlaag
  `
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
    ${SYNC}
  );
  CREATE INDEX idx_shape_plan ON shape(plan_id);
  `,
  // v4: voeding in ampère, gegevens keuringsinstelling, instellingen (installateur)
  `
  ALTER TABLE project ADD COLUMN supply_amp REAL;            -- bv. 20 voor "20A Voeding - 4 polig"
  ALTER TABLE project ADD COLUMN inspector_info TEXT;        -- adres en contact van de keuringsinstelling
  CREATE TABLE setting (id TEXT PRIMARY KEY, value TEXT, ${SYNC});
  `,
  // v5: polen = aantal polen (1-4), los van de breedte; 1P+N werd 2P en 3P+N werd 4P
  `
  UPDATE device SET poles='2P' WHERE poles='1P+N';
  UPDATE device SET poles='4P' WHERE poles='3P+N';
  `,
  // v6: verbruikers die rechtstreeks op het eendraadschema zijn toegevoegd (naast die van het situatieplan)
  `
  CREATE TABLE schema_load (
    id TEXT PRIMARY KEY, circuit_id TEXT NOT NULL REFERENCES circuit(id),
    type TEXT NOT NULL,                                      -- symbool-id (zoals op het situatieplan, evt. met #aantal)
    label TEXT, n INTEGER NOT NULL DEFAULT 1, pos REAL,
    ${SYNC}
  );
  CREATE INDEX idx_schema_load_circuit ON schema_load(circuit_id);
  `,
  // v7: plaatsing van de leiding = wand | plafond | vloer, los of in buis is een aparte eigenschap; volgorde van symbolen op het schema
  `
  ALTER TABLE circuit ADD COLUMN conduit INTEGER;            -- 1 = leiding in buis, 0 = los
  ALTER TABLE symbol ADD COLUMN spos REAL;                   -- volgorde van het symbool binnen zijn kring op het eendraadschema
  UPDATE circuit SET conduit=1 WHERE install='In buis';
  UPDATE circuit SET conduit=0 WHERE install='Los';
  UPDATE circuit SET install='In wand' WHERE install IN ('In muur', 'Op muur');
  UPDATE circuit SET install=NULL WHERE install IN ('In buis', 'Los');
  `,
];
