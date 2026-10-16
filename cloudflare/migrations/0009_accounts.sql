-- Gebruikers (installateurs; later ook klanten), sessies en eigenaarschap van projecten.
CREATE TABLE account (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT,
  role TEXT NOT NULL DEFAULT 'installer',              -- installer | client (klantenportaal, later)
  pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, pass_iter INTEGER NOT NULL,
  installer TEXT,                                       -- JSON: gegevens van de installateur (komen op de PDF)
  prefs TEXT,                                           -- JSON: voorkeuren (bv. favorieten in het situatieplan)
  created_at INTEGER NOT NULL
);
CREATE TABLE session (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES account(id),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX idx_session_account ON session(account_id);
CREATE TABLE auth_attempt (k TEXT NOT NULL, at INTEGER NOT NULL);   -- throttling van login/registratie
CREATE INDEX idx_auth_attempt ON auth_attempt(k, at);

ALTER TABLE project ADD COLUMN installer_id TEXT REFERENCES account(id);   -- eigenaar (installateur)
ALTER TABLE asset ADD COLUMN installer_id TEXT;
CREATE INDEX idx_project_installer ON project(installer_id);

-- Toegang voor anderen dan de eigenaar. Nu nog ongebruikt: klantenportaal (role = client: bekijken, afdrukken, problemen melden).
CREATE TABLE project_member (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), account_id TEXT NOT NULL REFERENCES account(id),
  role TEXT NOT NULL DEFAULT 'client',
  updated_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_member_account ON project_member(account_id);
CREATE INDEX idx_member_project ON project_member(project_id);
