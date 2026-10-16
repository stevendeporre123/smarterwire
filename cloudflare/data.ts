// Data-API: de client kan GEEN vrije SQL meer uitvoeren. Hij stuurt bewerkingen (put/set/where/…) en benoemde queries;
// de server controleert bij elke bewerking dat het project van de ingelogde gebruiker is en bouwt zelf de SQL.
import { HttpError, ID, json, type Env, type User } from './util';

// ---------- tabellen ----------
// Hoe een rij bij zijn project hoort (rechtstreeks of via een ouder).
const PARENT: Record<string, { col: string; table: string } | null> = {
  project: null,
  board: { col: 'project_id', table: 'project' }, circuit: { col: 'project_id', table: 'project' }, plan: { col: 'project_id', table: 'project' },
  device: { col: 'board_id', table: 'board' }, symbol: { col: 'plan_id', table: 'plan' }, shape: { col: 'plan_id', table: 'plan' },
  schema_load: { col: 'circuit_id', table: 'circuit' },
};
export const PROJECT_EXPR: Record<string, string> = {
  project: 'project.id', board: 'board.project_id', circuit: 'circuit.project_id', plan: 'plan.project_id',
  device: '(SELECT project_id FROM board WHERE board.id=device.board_id)',
  symbol: '(SELECT project_id FROM plan WHERE plan.id=symbol.plan_id)',
  shape: '(SELECT project_id FROM plan WHERE plan.id=shape.plan_id)',
  schema_load: '(SELECT project_id FROM circuit WHERE circuit.id=schema_load.circuit_id)',
};
export const TABLES = Object.keys(PARENT);
const RESERVED = new Set(['id', 'installer_id', 'updated_at']);

const colCache = new Map<string, Set<string>>();
export async function columns(env: Env, table: string) {
  let c = colCache.get(table);
  if (!c) {
    c = new Set((await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results.map((r) => r.name));
    colCache.set(table, c);
  }
  return c;
}
const mustTable = (t: unknown): string => { if (typeof t !== 'string' || !(t in PARENT)) throw new HttpError(400, 'Onbekende tabel'); return t; };

// ---------- toegang ----------
const WRITABLE = `(SELECT id FROM project WHERE installer_id=? AND deleted=0)`;
const READABLE = `(SELECT id FROM project WHERE deleted=0 AND (installer_id=? OR id IN (SELECT project_id FROM project_member WHERE account_id=? AND deleted=0)))`;

export class Ctx {
  private acc = new Map<string, 'owner' | 'client' | null>();
  /** Rijen die in dezelfde bewerking nog aangemaakt worden: tabel:id → project. */
  created = new Map<string, string>();
  /** Projecten die in deze bewerking door de gebruiker zelf worden aangemaakt. */
  private fresh = new Set<string>();
  markNew(pid: string) { this.fresh.add(pid); }
  constructor(public env: Env, public user: User) {}

  async access(pid: string): Promise<'owner' | 'client' | null> {
    if (this.fresh.has(pid)) return 'owner';
    if (!this.acc.has(pid)) {
      const r = await this.env.DB.prepare(
        `SELECT installer_id, (SELECT role FROM project_member WHERE project_id=project.id AND account_id=? AND deleted=0) mrole FROM project WHERE id=? AND deleted=0`)
        .bind(this.user.id, pid).first<{ installer_id: string | null; mrole: string | null }>();
      this.acc.set(pid, !r ? null : r.installer_id === this.user.id ? 'owner' : r.mrole ? 'client' : null);
    }
    return this.acc.get(pid)!;
  }
  async needRead(pid: string | null | undefined) { if (!pid || !(await this.access(pid))) throw new HttpError(404, 'Niet gevonden'); return pid; }
  async needWrite(pid: string | null | undefined) {
    if (!pid) throw new HttpError(404, 'Niet gevonden');
    if ((await this.access(pid)) !== 'owner') throw new HttpError(403, 'Geen toegang tot dit project');
    return pid;
  }
  async projectOf(table: string, id: unknown): Promise<string | null> {
    if (typeof id !== 'string' || !ID.test(id)) return null;
    const hit = this.created.get(`${table}:${id}`);
    if (hit) return hit;
    return (await this.env.DB.prepare(`SELECT ${PROJECT_EXPR[table]} pid FROM ${table} WHERE id=?`).bind(id).first<{ pid: string | null }>())?.pid ?? null;
  }
}

function scalar(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') { if (!Number.isFinite(v)) return null; return v; }
  if (typeof v === 'string') { if (v.length > 500_000) throw new HttpError(400, 'Waarde te lang'); return v; }
  throw new HttpError(400, 'Ongeldige waarde');
}

// ---------- bewerkingen ----------
type Where = Record<string, unknown>;
export type Op =
  | { t: 'put'; table: string; row: Record<string, unknown> }
  | { t: 'set'; table: string; id: string; patch: Record<string, unknown> }
  | { t: 'where'; table: string; set: Record<string, unknown>; where: Where }
  | { t: 'unlinkDevice'; id: string };

async function assetMine(c: Ctx, v: unknown) {
  if (v === null || v === undefined) return;
  if (!(await c.env.DB.prepare('SELECT 1 FROM asset WHERE id=? AND installer_id=?').bind(v, c.user.id).first())) throw new HttpError(400, 'Onbekende foto');
}

async function put(c: Ctx, op: Extract<Op, { t: 'put' }>): Promise<D1PreparedStatement[]> {
  const table = mustTable(op.table), row = op.row;
  if (typeof row?.id !== 'string' || !ID.test(row.id)) throw new HttpError(400, 'Ongeldig id');
  const parent = PARENT[table], cols = await columns(c.env, table);
  const existing = await c.projectOf(table, row.id);
  let pid: string | null;
  if (existing) {
    pid = await c.needWrite(existing);
    const pv = parent && row[parent.col];
    if (pv && (await c.projectOf(parent!.table, pv)) !== pid) throw new HttpError(400, 'Een rij kan niet naar een ander project verhuizen');
  } else if (!parent) { pid = row.id; c.markNew(pid); }                    // nieuw project
  else {
    pid = await c.projectOf(parent.table, row[parent.col]);
    if (!pid) throw new HttpError(400, `Onbekende ouder (${parent.col})`);
    await c.needWrite(pid);
  }
  c.created.set(`${table}:${row.id}`, pid!);
  if ('asset_id' in row && cols.has('asset_id')) await assetMine(c, row.asset_id);

  const use = Object.keys(row).filter((k) => cols.has(k) && !RESERVED.has(k));
  const names = ['id', ...use, 'updated_at', ...(table === 'project' ? ['installer_id'] : [])];
  const vals = ['id', ...use].map((k) => (k === 'deleted' ? (row[k] ? 1 : 0) : scalar(row[k]))).concat([Date.now(), ...(table === 'project' ? [c.user.id] : [])]);
  const set = [...use, 'updated_at'].map((k) => `${k}=excluded.${k}`).join(',');
  // extra slot: bij een bestaande rij mag de update enkel gebeuren als het project van de gebruiker is
  return [c.env.DB.prepare(
    `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})
     ON CONFLICT(id) DO UPDATE SET ${set} WHERE ${PROJECT_EXPR[table]} IN ${WRITABLE}`).bind(...vals, c.user.id)];
}

async function setRow(c: Ctx, op: Extract<Op, { t: 'set' }>): Promise<D1PreparedStatement[]> {
  const table = mustTable(op.table), parent = PARENT[table], cols = await columns(c.env, table);
  await c.needWrite(await c.projectOf(table, op.id));
  const keys = Object.keys(op.patch ?? {}).filter((k) => cols.has(k) && !RESERVED.has(k) && k !== parent?.col);
  if (!keys.length) return [];
  if (keys.includes('asset_id')) await assetMine(c, op.patch.asset_id);
  return [c.env.DB.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE id=? AND ${PROJECT_EXPR[table]} IN ${WRITABLE}`)
    .bind(...keys.map((k) => (k === 'deleted' ? (op.patch[k] ? 1 : 0) : scalar(op.patch[k]))), Date.now(), op.id, c.user.id)];
}

/** UPDATE … SET … WHERE kolom = waarde [AND kolom IN (…)] – enkel binnen projecten van de gebruiker, nooit over projecten heen. */
async function whereOp(c: Ctx, op: Extract<Op, { t: 'where' }>): Promise<D1PreparedStatement[]> {
  const table = mustTable(op.table), parent = PARENT[table], cols = await columns(c.env, table);
  const sets = Object.keys(op.set ?? {}).filter((k) => cols.has(k) && !RESERVED.has(k) && k !== parent?.col);
  const wk = Object.keys(op.where ?? {});
  if (!sets.length || !wk.length || wk.some((k) => !cols.has(k))) throw new HttpError(400, 'Ongeldige bewerking');
  const arrays = wk.filter((k) => Array.isArray(op.where[k]));
  if (arrays.length > 1) throw new HttpError(400, 'Max. één lijst per bewerking');
  const out: D1PreparedStatement[] = [], now = Date.now();
  const chunks: (string | number | null)[][] = arrays.length ? [] : [[]];
  if (arrays.length) { const a = (op.where[arrays[0]] as unknown[]).map(scalar); for (let i = 0; i < a.length; i += 80) chunks.push(a.slice(i, i + 80)); }
  for (const chunk of chunks) {
    const conds = wk.map((k) => (Array.isArray(op.where[k]) ? `${k} IN (${chunk.map(() => '?').join(',')})` : op.where[k] === null ? `${k} IS NULL` : `${k}=?`));
    const binds = wk.flatMap((k) => (Array.isArray(op.where[k]) ? chunk : op.where[k] === null ? [] : [scalar(op.where[k])]));
    out.push(c.env.DB.prepare(`UPDATE ${table} SET ${sets.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE deleted=0 AND ${conds.join(' AND ')} AND ${PROJECT_EXPR[table]} IN ${WRITABLE}`)
      .bind(...sets.map((k) => (k === 'deleted' ? (op.set[k] ? 1 : 0) : scalar(op.set[k]))), now, ...binds, c.user.id));
    if (!chunk.length && arrays.length) break;
  }
  return out;
}

/** Zekering verwijderd: lege automatisch aangemaakte kringen verdwijnen mee, andere kringen blijven bestaan maar los. */
async function unlinkDevice(c: Ctx, op: Extract<Op, { t: 'unlinkDevice' }>): Promise<D1PreparedStatement[]> {
  const pid = await c.needWrite(await c.projectOf('device', op.id)), now = Date.now(), d = c.env.DB;
  return [
    d.prepare(`UPDATE circuit SET deleted=1, updated_at=? WHERE project_id=? AND deleted=0 AND (device_id=? OR new_device_id=?) AND name LIKE 'Kring %'
       AND cable_type IS NULL AND NOT EXISTS (SELECT 1 FROM symbol s WHERE s.circuit_id=circuit.id AND s.deleted=0)
       AND (device_id IS NULL OR new_device_id IS NULL)`).bind(now, pid, op.id, op.id),
    d.prepare(`UPDATE circuit SET device_id=NULL, updated_at=? WHERE project_id=? AND deleted=0 AND device_id=?`).bind(now, pid, op.id),
    d.prepare(`UPDATE circuit SET new_device_id=NULL, updated_at=? WHERE project_id=? AND deleted=0 AND new_device_id=?`).bind(now, pid, op.id),
  ];
}

export async function runOps(c: Ctx, ops: Op[]) {
  if (!Array.isArray(ops) || ops.length > 2000) throw new HttpError(400, 'Ongeldige bewerkingen');
  const stmts: D1PreparedStatement[] = [];
  for (const op of ops) {
    switch (op?.t) {
      case 'put': stmts.push(...(await put(c, op))); break;
      case 'set': stmts.push(...(await setRow(c, op))); break;
      case 'where': stmts.push(...(await whereOp(c, op))); break;
      case 'unlinkDevice': stmts.push(...(await unlinkDevice(c, op))); break;
      default: throw new HttpError(400, 'Onbekende bewerking');
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);   // atomisch
  return json(true);
}

// ---------- queries ----------
const LIST: Record<string, { by: string; order: string }> = {
  board: { by: 'project_id', order: 'kind, name' },
  device: { by: 'board_id', order: 'row_no, pos' },
  circuit: { by: 'project_id', order: `CASE WHEN nr GLOB '[0-9]*' THEN CAST(nr AS INTEGER) ELSE 9999 END, nr, name` },
  plan: { by: 'project_id', order: 'level, name' },
  shape: { by: 'plan_id', order: 'rowid' },
  symbol: { by: 'plan_id', order: 'rowid' },
};
const BY_PROJECT: Record<string, string> = {
  devices: `SELECT d.* FROM device d JOIN board b ON b.id=d.board_id WHERE d.deleted=0 AND b.deleted=0 AND b.project_id=?`,
  circuitDevices: `SELECT d.*, b.kind bkind FROM device d JOIN board b ON b.id=d.board_id WHERE d.deleted=0 AND b.deleted=0 AND b.project_id=? ORDER BY b.kind, b.name, d.row_no, d.pos`,
  circuitLinks: `SELECT nr, device_id, new_device_id FROM circuit WHERE deleted=0 AND project_id=?`,
  schemaLoads: `SELECT l.* FROM schema_load l JOIN circuit c ON c.id=l.circuit_id WHERE l.deleted=0 AND c.deleted=0 AND c.project_id=? ORDER BY l.pos, l.rowid`,
  planSymbols: `SELECT s.id, s.circuit_id, s.type, s.label, s.spos, s.sgrp, p.name plan FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? ORDER BY p.level, p.name, s.rowid`,
  symLevels: `SELECT s.circuit_id, COALESCE(p.level, p.name) level, COUNT(*) n FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? AND s.circuit_id IS NOT NULL GROUP BY s.circuit_id, p.id`,
  symCounts: `SELECT s.circuit_id id, COUNT(*) n FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? AND s.circuit_id IS NOT NULL GROUP BY s.circuit_id`,
};

export async function query(c: Ctx, name: string, args: Record<string, any>) {
  const d = c.env.DB, uid = c.user.id;
  if (name === 'projects') {
    return (await d.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM board b WHERE b.project_id=p.id AND b.deleted=0) boards,
        (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0) circuits,
        (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0 AND c.status!='onbekend') done
      FROM project p WHERE p.id IN ${READABLE} ORDER BY p.updated_at DESC`).bind(uid, uid).all()).results;
  }
  if (name === 'project') {
    if (!(await c.access(String(args.id)))) return [];
    return (await d.prepare('SELECT * FROM project WHERE id=? AND deleted=0').bind(args.id).all()).results;
  }
  if (name === 'list') {
    const t = String(args.table), cfg = LIST[t];
    if (!cfg) throw new HttpError(400, 'Onbekende lijst');
    const pid = cfg.by === 'project_id' ? args.by : await c.projectOf(PARENT[t]!.table, args.by);
    await c.needRead(pid);
    return (await d.prepare(`SELECT * FROM ${t} WHERE deleted=0 AND ${cfg.by}=? ORDER BY ${cfg.order}`).bind(args.by).all()).results;
  }
  if (name === 'assetSize') {
    return (await d.prepare(`SELECT width, height FROM asset WHERE id=? AND ${ASSET_READABLE}`).bind(args.id, ...assetBinds(uid)).all()).results;
  }
  if (BY_PROJECT[name]) {
    await c.needRead(args.project);
    return (await d.prepare(BY_PROJECT[name]).bind(args.project).all()).results;
  }
  throw new HttpError(400, 'Onbekende query');
}

// Foto's: van mij, of in gebruik in een project dat ik mag bekijken
export const ASSET_READABLE = `(installer_id=? OR id IN (SELECT asset_id FROM board WHERE asset_id IS NOT NULL AND project_id IN ${READABLE})
  OR id IN (SELECT asset_id FROM plan WHERE asset_id IS NOT NULL AND project_id IN ${READABLE}))`;
export const assetBinds = (uid: string) => [uid, uid, uid, uid, uid];
