// Worker: D1-database (persistente data), foto's, project import/export en proxy voor fotoanalyse.
// De Anthropic-sleutel blijft server-side.
//   wrangler secret put ANTHROPIC_API_KEY
// NB: nog niet getest tegen de echte API – eerst op een paar echte foto's uitproberen.
export interface Env { DB: D1Database; ANTHROPIC_API_KEY: string; MODEL?: string; ALLOW_ORIGIN?: string }

const PROMPT = `Je ziet een foto van een Belgische elektrische zekeringskast (DIN-rail).
Geef ALLE zichtbare modulaire toestellen terug als JSON, zonder uitleg, in dit formaat:
{"devices":[{"kind":"hoofd|differentieel|automaat|aardlekautomaat|smelt|overspanning|contactor|schakelaar|trafo|anders",
"label":"opschrift indien leesbaar","poles":"1P|2P|3P|4P","rating_a":16,"curve":"B|C|D","sens_ma":30,"dtype":"AC|A|F|B",
"modules":1,"rect":{"x":0.1,"y":0.2,"w":0.03,"h":0.2},"notes":"onzeker? leg uit"}]}
poles = aantal polen (1 tot 4), NIET het aantal fases. modules = breedte in DIN-modules van 18 mm (mag 1, 1.5, 2, 3, 4…);
een 2-polige mini-automaat kan 2 polen op 1 module hebben, dus tel de breedte apart van de polen.
rect = omkadering van het toestel, genomen als fractie (0..1) van de breedte/hoogte van de foto.
Laat velden weg die je niet kan aflezen; gok niet. Elke toestel apart, ook naast elkaar.`;


const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });

// ---------- SQL ----------
// Enkel gewone gegevensstatements (geen DDL/PRAGMA/ATTACH, één statement per aanroep).
// Schermt de database af voor fouten; échte toegangscontrole = Cloudflare Access op de domeinnaam.
type Stmt = { sql: string; bind?: unknown[] };
function checked(s: Stmt): string | null {
  if (typeof s?.sql !== 'string') return null;
  const q = s.sql.trim().replace(/;+\s*$/, '');
  return /^(select|insert|update|delete|with)\b/i.test(q) && !q.includes(';') ? q : null;
}
const prep = (env: Env, s: Stmt) => {
  const q = checked(s);
  if (!q) throw new HttpError(400, 'Niet toegestaan SQL-statement');
  return env.DB.prepare(q).bind(...(s.bind ?? []).map((v) => v ?? null));
};
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// ---------- project export / import ----------
// Volgorde = volgorde van invoegen (ouders voor kinderen, i.v.m. foreign keys).
const PROJECT_TABLES = ['asset', 'project', 'board', 'device', 'circuit', 'plan', 'symbol', 'shape', 'schema_load'] as const;
const FORMAT = 'smarterwire-project';
const IDENT = /^[a-z_][a-z0-9_]*$/;

// D1 geeft BLOB's terug als getallenarray; binden doen we als ArrayBuffer
const b64 = (buf: ArrayLike<number>) => { let s = ''; const u = Uint8Array.from(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

async function exportProject(env: Env, id: string) {
  const all = async (q: string, ...b: unknown[]) => (await env.DB.prepare(q).bind(...b).all<Record<string, any>>()).results;
  const project = await all('SELECT * FROM project WHERE id=?', id);
  if (!project.length) throw new HttpError(404, 'Project niet gevonden');
  const t: Record<string, Record<string, any>[]> = { project };
  t.board = await all('SELECT * FROM board WHERE project_id=?', id);
  t.device = await all('SELECT * FROM device WHERE board_id IN (SELECT id FROM board WHERE project_id=?)', id);
  t.circuit = await all('SELECT * FROM circuit WHERE project_id=?', id);
  t.plan = await all('SELECT * FROM plan WHERE project_id=?', id);
  t.symbol = await all('SELECT * FROM symbol WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)', id);
  t.shape = await all('SELECT * FROM shape WHERE plan_id IN (SELECT id FROM plan WHERE project_id=?)', id);
  t.schema_load = await all('SELECT * FROM schema_load WHERE circuit_id IN (SELECT id FROM circuit WHERE project_id=?)', id);
  const ids = [...new Set([...t.board, ...t.plan].map((r) => r.asset_id).filter(Boolean))];
  t.asset = [];
  for (const a of ids) { // één per keer: een foto kan bijna 2 MB wegen
    const r = await env.DB.prepare('SELECT * FROM asset WHERE id=?').bind(a).first<Record<string, any>>();
    if (r) t.asset.push({ ...r, data: b64(r.data) });
  }
  return { format: FORMAT, version: 1, exported_at: Date.now(), tables: t };
}

async function importProject(env: Env, doc: any) {
  if (doc?.format !== FORMAT || typeof doc.tables !== 'object') throw new HttpError(400, 'Dit is geen smarterwire-projectbestand');
  const stmts: D1PreparedStatement[] = [];
  const counts: Record<string, number> = {};
  for (const table of PROJECT_TABLES) {
    const rows: Record<string, any>[] = doc.tables[table] ?? [];
    if (!rows.length) continue;
    const known = new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results).map((c) => c.name));
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => IDENT.test(c) && known.has(c));
      if (!cols.includes('id') || typeof row.id !== 'string') throw new HttpError(400, `Rij zonder id in ${table}`);
      const vals = cols.map((c) => (table === 'asset' && c === 'data' ? unb64(row[c]) : row[c] ?? null));
      const set = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',');
      // last-write-wins per rij: een nieuwere versie in de database blijft behouden
      stmts.push(env.DB.prepare(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
         ON CONFLICT(id) DO UPDATE SET ${set} WHERE excluded.updated_at >= ${table}.updated_at`).bind(...vals));
    }
    counts[table] = rows.length;
  }
  await env.DB.batch(stmts);
  return { ok: true, counts, project_id: doc.tables.project?.[0]?.id };
}

// ---------- assets (foto's) ----------
async function asset(env: Env, req: Request, id: string) {
  if (!/^[\w-]{8,64}$/.test(id)) throw new HttpError(400, 'Ongeldig id');
  if (req.method === 'GET') {
    const r = await env.DB.prepare('SELECT mime, data FROM asset WHERE id=? AND deleted=0').bind(id).first<{ mime: string; data: number[] }>();
    if (!r) return new Response('Niet gevonden', { status: 404 });
    return new Response(Uint8Array.from(r.data), { headers: { 'content-type': r.mime, 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  if (req.method === 'PUT') {
    const data = await req.arrayBuffer();
    if (data.byteLength > 1_900_000) throw new HttpError(413, 'Afbeelding te groot voor D1 (max. 2 MB)');
    const mime = req.headers.get('content-type') ?? 'image/jpeg';
    await env.DB.prepare(
      `INSERT INTO asset (id,mime,width,height,data,updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET mime=excluded.mime,width=excluded.width,height=excluded.height,data=excluded.data,updated_at=excluded.updated_at`)
      .bind(id, mime, Number(req.headers.get('x-width')) || null, Number(req.headers.get('x-height')) || null, data, Date.now()).run();
    return json({ ok: true });
  }
  return new Response('Method not allowed', { status: 405 });
}

// ---------- AI ----------
async function analyze(env: Env, req: Request, cors: Record<string, string>) {
  const { image, mime } = (await req.json()) as { image: string; mime: string };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.MODEL ?? 'claude-sonnet-5-5', max_tokens: 8000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
        { type: 'text', text: PROMPT }] }],
    }),
  });
  if (!r.ok) return new Response(await r.text(), { status: 502, headers: cors });
  const data: any = await r.json();
  const text: string = data.content?.find((c: any) => c.type === 'text')?.text ?? '{}';
  return new Response(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1), { headers: { ...cors, 'content-type': 'application/json' } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = { 'access-control-allow-origin': env.ALLOW_ORIGIN ?? '*', 'access-control-allow-headers': 'content-type,x-width,x-height' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;
    try {
      if (path === '/api/analyze-board' && req.method === 'POST') return await analyze(env, req, cors);
      if (path === '/api/db/query' && req.method === 'POST') {
        const s = (await req.json()) as Stmt;
        return json((await prep(env, s).all()).results);
      }
      if (path === '/api/db/batch' && req.method === 'POST') {
        const { stmts } = (await req.json()) as { stmts: Stmt[] };
        await env.DB.batch(stmts.map((s) => prep(env, s)));   // atomisch
        return json(true);
      }
      let m: RegExpMatchArray | null;
      if ((m = path.match(/^\/api\/asset\/([^/]+)$/))) return await asset(env, req, m[1]);
      if ((m = path.match(/^\/api\/project\/([^/]+)\/export$/)) && req.method === 'GET') return json(await exportProject(env, m[1]));
      if (path === '/api/project/import' && req.method === 'POST') return json(await importProject(env, await req.json()));
      return new Response('Niet gevonden', { status: 404 });
    } catch (e: any) {
      return json({ error: String(e?.message ?? e) }, e instanceof HttpError ? e.status : 500);
    }
  },
};
