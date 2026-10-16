// Project exporteren/importeren (JSON incl. foto's). Bij importeren wordt het project eigendom van de ingelogde gebruiker.
import { ASSET_READABLE, assetBinds, columns, Ctx, PROJECT_EXPR } from './data';
import { HttpError, ID, json } from './util';

// Volgorde = volgorde van invoegen (ouders voor kinderen, i.v.m. foreign keys).
const ORDER = ['asset', 'project', 'board', 'device', 'circuit', 'plan', 'symbol', 'shape', 'schema_load'] as const;
const FORMAT = 'smarterwire-project';
const STRIP = new Set(['installer_id']);
const IDENT = /^[a-z_][a-z0-9_]*$/;
const MIME = /^image\/(jpeg|png|webp)$/;

// D1 geeft BLOB's terug als getallenarray; binden doen we als ArrayBuffer
const b64 = (buf: ArrayLike<number>) => { let s = ''; const u = Uint8Array.from(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
const strip = (r: Record<string, any>) => Object.fromEntries(Object.entries(r).filter(([k]) => !STRIP.has(k)));

export async function exportProject(c: Ctx, id: string) {
  await c.needRead(id);
  const all = async (q: string) => (await c.env.DB.prepare(q).bind(id).all<Record<string, any>>()).results.map(strip);
  const t: Record<string, Record<string, any>[]> = {};
  t.project = await all('SELECT * FROM project WHERE id=?');
  t.board = await all('SELECT * FROM board WHERE project_id=?');
  t.device = await all('SELECT * FROM device WHERE board_id IN (SELECT id FROM board WHERE project_id=?)');
  t.circuit = await all('SELECT * FROM circuit WHERE project_id=?');
  t.plan = await all('SELECT * FROM plan WHERE project_id=?');
  t.symbol = await all('SELECT * FROM symbol WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)');
  t.shape = await all('SELECT * FROM shape WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)');
  t.schema_load = await all('SELECT * FROM schema_load WHERE circuit_id IN (SELECT id FROM circuit WHERE project_id=?)');
  t.asset = [];
  for (const a of new Set([...t.board, ...t.plan].map((r) => r.asset_id).filter(Boolean))) {   // één per keer: een foto kan bijna 2 MB wegen
    const r = await c.env.DB.prepare(`SELECT * FROM asset WHERE id=? AND ${ASSET_READABLE}`).bind(a, ...assetBinds(c.user.id)).first<Record<string, any>>();
    if (r) t.asset.push({ ...strip(r), data: b64(r.data) });
  }
  return json({ format: FORMAT, version: 2, exported_at: Date.now(), tables: t });
}

const chunks = <T>(a: T[], n = 80) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function importProject(c: Ctx, doc: any) {
  if (doc?.format !== FORMAT || typeof doc.tables !== 'object') throw new HttpError(400, 'Dit is geen smarterwire-projectbestand');
  const d = c.env.DB, me = c.user.id;
  const rowsOf = (t: string): Record<string, any>[] => (Array.isArray(doc.tables[t]) ? doc.tables[t] : []);
  const total = ORDER.reduce((n, t) => n + rowsOf(t).length, 0);
  if (total > 50_000) throw new HttpError(413, 'Bestand te groot');
  for (const t of ORDER) for (const r of rowsOf(t)) if (typeof r?.id !== 'string' || !ID.test(r.id)) throw new HttpError(400, `Ongeldig id in ${t}`);
  if (rowsOf('project').length !== 1) throw new HttpError(400, 'Een bestand bevat precies één project');
  const pid: string = rowsOf('project')[0].id;
  if (await c.projectOf('project', pid)) await c.needWrite(pid);   // bestaat al: enkel samenvoegen als het van mij is

  // ouders binnen het bestand: een rij mag enkel naar rijen uit hetzelfde bestand verwijzen
  const ids = (t: string) => new Set(rowsOf(t).map((r) => r.id));
  const boards = ids('board'), plans = ids('plan'), circuits = ids('circuit'), assets = ids('asset');
  const fix: Record<string, (r: Record<string, any>) => void> = {
    board: (r) => { r.project_id = pid; },
    circuit: (r) => { r.project_id = pid; },
    plan: (r) => { r.project_id = pid; },
    device: (r) => { if (!boards.has(r.board_id)) throw new HttpError(400, 'Toestel zonder kast in het bestand'); },
    symbol: (r) => { if (!plans.has(r.plan_id)) throw new HttpError(400, 'Symbool zonder plan in het bestand'); },
    shape: (r) => { if (!plans.has(r.plan_id)) throw new HttpError(400, 'Vorm zonder plan in het bestand'); },
    schema_load: (r) => { if (!circuits.has(r.circuit_id)) throw new HttpError(400, 'Verbruiker zonder kring in het bestand'); },
  };
  // foto's: uit het bestand, of een foto die al van mij is
  const ownAssets = new Set<string>();
  for (const r of [...rowsOf('board'), ...rowsOf('plan')]) {
    if (r.asset_id && !assets.has(r.asset_id) && !ownAssets.has(r.asset_id)) {
      if (!(await d.prepare('SELECT 1 FROM asset WHERE id=? AND installer_id=?').bind(r.asset_id, me).first())) throw new HttpError(400, 'Verwijzing naar een onbekende foto');
      ownAssets.add(r.asset_id);
    }
  }
  // geen id-botsingen met rijen van iemand anders
  for (const t of ORDER) {
    if (t === 'project') continue;
    for (const part of chunks(rowsOf(t).map((r) => r.id))) {
      const bad = t === 'asset'
        ? await d.prepare(`SELECT id FROM asset WHERE id IN (${part.map(() => '?').join(',')}) AND installer_id IS NOT NULL AND installer_id!=?`).bind(...part, me).first()
        : await d.prepare(`SELECT id FROM ${t} WHERE id IN (${part.map(() => '?').join(',')}) AND ${PROJECT_EXPR[t]} IS NOT ?`).bind(...part, pid).first();
      if (bad) throw new HttpError(409, 'Dit bestand bevat gegevens die bij een ander project horen');
    }
  }

  const stmts: D1PreparedStatement[] = [], counts: Record<string, number> = {};
  for (const table of ORDER) {
    const rows = rowsOf(table);
    if (!rows.length) continue;
    const known = await columns(c.env, table);
    for (const row of rows) {
      fix[table]?.(row);
      if (table === 'asset') {
        if (!MIME.test(String(row.mime)) || typeof row.data !== 'string') throw new HttpError(400, 'Ongeldige foto in het bestand');
      }
      const cols = Object.keys(row).filter((k) => IDENT.test(k) && known.has(k) && !STRIP.has(k));
      const vals: unknown[] = cols.map((k) => (table === 'asset' && k === 'data' ? unb64(row[k]) : row[k] ?? null));
      if (table === 'asset' && (vals[cols.indexOf('data')] as ArrayBuffer).byteLength > 1_900_000) throw new HttpError(413, 'Foto te groot voor D1 (max. 2 MB)');
      if (table === 'asset' || table === 'project') { cols.push('installer_id'); vals.push(me); }
      const set = cols.filter((k) => k !== 'id' && k !== 'installer_id').map((k) => `${k}=excluded.${k}`).join(',');
      // last-write-wins per rij: een nieuwere versie in de database blijft behouden
      stmts.push(d.prepare(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
         ON CONFLICT(id) DO UPDATE SET ${set} WHERE excluded.updated_at >= ${table}.updated_at`).bind(...vals));
    }
    counts[table] = rows.length;
  }
  await d.batch(stmts);
  return json({ ok: true, counts, project_id: pid });
}
