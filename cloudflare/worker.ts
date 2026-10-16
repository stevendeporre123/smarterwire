// Worker: accounts, data-API op D1, foto's, project import/export en proxy voor fotoanalyse.
// De Anthropic-sleutel blijft server-side.
import { changePassword, currentUser, login, logout, publicUser, register, saveInstaller, savePref } from './auth';
import { ASSET_READABLE, assetBinds, Ctx, query, runOps } from './data';
import { exportProject, importProject } from './transfer';
import { HttpError, ID, json, type Env, type User } from './util';

const PROMPT = `Je ziet een foto van een Belgische elektrische zekeringskast (DIN-rail).
Geef ALLE zichtbare modulaire toestellen terug als JSON, zonder uitleg, in dit formaat:
{"devices":[{"kind":"hoofd|differentieel|automaat|aardlekautomaat|smelt|overspanning|contactor|schakelaar|trafo|anders",
"label":"opschrift indien leesbaar","poles":"1P|2P|3P|4P","rating_a":16,"curve":"B|C|D","sens_ma":30,"dtype":"AC|A|F|B",
"modules":1,"rect":{"x":0.1,"y":0.2,"w":0.03,"h":0.2},"notes":"onzeker? leg uit"}]}
poles = aantal polen (1 tot 4), NIET het aantal fases. modules = breedte in DIN-modules van 18 mm (mag 1, 1.5, 2, 3, 4…);
een 2-polige mini-automaat kan 2 polen op 1 module hebben, dus tel de breedte apart van de polen.
rect = omkadering van het toestel, genomen als fractie (0..1) van de breedte/hoogte van de foto.
Laat velden weg die je niet kan aflezen; gok niet. Elke toestel apart, ook naast elkaar.`;

// ---------- foto's ----------
async function asset(c: Ctx, req: Request, id: string) {
  if (!ID.test(id)) throw new HttpError(400, 'Ongeldig id');
  if (req.method === 'GET') {
    const r = await c.env.DB.prepare(`SELECT mime, data FROM asset WHERE id=? AND deleted=0 AND ${ASSET_READABLE}`).bind(id, ...assetBinds(c.user.id)).first<{ mime: string; data: number[] }>();
    if (!r) return new Response('Niet gevonden', { status: 404 });
    return new Response(Uint8Array.from(r.data), { headers: { 'content-type': r.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }
  if (req.method === 'PUT') {
    const data = await req.arrayBuffer();
    if (data.byteLength > 1_900_000) throw new HttpError(413, 'Afbeelding te groot voor D1 (max. 2 MB)');
    const mime = (req.headers.get('content-type') ?? '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new HttpError(415, 'Enkel afbeeldingen (jpeg, png, webp)');
    const res = await c.env.DB.prepare(
      `INSERT INTO asset (id,mime,width,height,data,updated_at,installer_id) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET mime=excluded.mime,width=excluded.width,height=excluded.height,data=excluded.data,updated_at=excluded.updated_at
       WHERE asset.installer_id=excluded.installer_id`)
      .bind(id, mime, Number(req.headers.get('x-width')) || null, Number(req.headers.get('x-height')) || null, data, Date.now(), c.user.id).run();
    if (!res.meta.changes) throw new HttpError(403, 'Geen toegang');
    return json({ ok: true });
  }
  throw new HttpError(405, 'Method not allowed');
}

// ---------- AI ----------
async function analyze(env: Env, req: Request) {
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
  if (!r.ok) throw new HttpError(502, (await r.text()).slice(0, 300));
  const data: any = await r.json();
  const text: string = data.content?.find((c: any) => c.type === 'text')?.text ?? '{}';
  return new Response(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), path = url.pathname;
    try {
      // CSRF: schrijvende aanvragen enkel van de eigen site (cookies zijn daarnaast SameSite=Lax)
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const site = req.headers.get('sec-fetch-site'), origin = req.headers.get('origin');
        if (site ? site !== 'same-origin' && site !== 'none' : origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-origin aanvraag geweigerd');
      }
      const post = req.method === 'POST';
      if (path === '/api/auth/register' && post) return await register(env, req);
      if (path === '/api/auth/login' && post) return await login(env, req);
      if (path === '/api/auth/logout' && post) return await logout(env, req);

      const user: User | null = await currentUser(env, req);
      if (!user) throw new HttpError(401, 'Niet aangemeld');
      const c = new Ctx(env, user);
      let m: RegExpMatchArray | null;

      if (path === '/api/me' && req.method === 'GET') return json(publicUser(user));
      if (path === '/api/me/installer' && req.method === 'PUT') return await saveInstaller(env, req, user);
      if ((m = path.match(/^\/api\/me\/prefs\/(\w+)$/)) && req.method === 'PUT') return await savePref(env, req, user, m[1]);
      if (path === '/api/auth/password' && post) return await changePassword(env, req, user);

      if (path === '/api/db/ops' && post) return await runOps(c, ((await req.json()) as any).ops);
      if (path === '/api/db/q' && post) { const b: any = await req.json(); return json(await query(c, String(b.name), b.args ?? {})); }
      if (path === '/api/analyze-board' && post) return await analyze(env, req);
      if (path === '/api/project/import' && post) return await importProject(c, await req.json());

      if ((m = path.match(/^\/api\/asset\/([^/]+)$/))) return await asset(c, req, m[1]);
      if ((m = path.match(/^\/api\/project\/([^/]+)\/export$/)) && req.method === 'GET') return await exportProject(c, m[1]);
      return new Response('Niet gevonden', { status: 404 });
    } catch (e: any) {
      if (!(e instanceof HttpError)) console.error(e);
      return json({ error: e instanceof HttpError ? e.message : 'Interne fout' }, e instanceof HttpError ? e.status : 500);
    }
  },
};
