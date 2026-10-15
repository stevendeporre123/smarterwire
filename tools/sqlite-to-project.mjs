// Zet een oude lokale back-up (.sqlite3 uit de vorige, offline versie) om naar projectbestanden voor "Importeer project".
//   node tools/sqlite-to-project.mjs <back-up.sqlite3> [uitmap]     (Node 22+)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [file, out = '.'] = process.argv.slice(2);
if (!file) { console.error('Gebruik: node tools/sqlite-to-project.mjs <back-up.sqlite3> [uitmap]'); process.exit(1); }
const db = new DatabaseSync(file, { readOnly: true });
const all = (q, ...b) => db.prepare(q).all(...b);
mkdirSync(out, { recursive: true });

for (const project of all('SELECT * FROM project WHERE deleted=0')) {
  const t = { project: [project] };
  t.board = all('SELECT * FROM board WHERE project_id=?', project.id);
  t.device = all('SELECT * FROM device WHERE board_id IN (SELECT id FROM board WHERE project_id=?)', project.id);
  t.circuit = all('SELECT * FROM circuit WHERE project_id=?', project.id);
  t.plan = all('SELECT * FROM plan WHERE project_id=?', project.id);
  t.symbol = all('SELECT * FROM symbol WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)', project.id);
  t.shape = all('SELECT * FROM shape WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)', project.id);
  t.schema_load = all('SELECT * FROM schema_load WHERE circuit_id IN (SELECT id FROM circuit WHERE project_id=?)', project.id);
  const ids = new Set([...t.board, ...t.plan].map((r) => r.asset_id).filter(Boolean));
  t.asset = [...ids].flatMap((id) => all('SELECT * FROM asset WHERE id=?', id).map((a) => ({ ...a, data: Buffer.from(a.data).toString('base64') })));
  const name = join(out, `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || project.id}.smarterwire.json`);
  writeFileSync(name, JSON.stringify({ format: 'smarterwire-project', version: 1, exported_at: Date.now(), tables: t }));
  console.log(name, Object.entries(t).map(([k, v]) => `${k}:${v.length}`).join(' '));
}
