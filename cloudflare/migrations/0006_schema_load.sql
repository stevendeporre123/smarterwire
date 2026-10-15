CREATE TABLE schema_load (
    id TEXT PRIMARY KEY, circuit_id TEXT NOT NULL REFERENCES circuit(id),
    type TEXT NOT NULL,                                      -- symbool-id (zoals op het situatieplan, evt. met #aantal)
    label TEXT, n INTEGER NOT NULL DEFAULT 1, pos REAL,
    updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_schema_load_circuit ON schema_load(circuit_id);
