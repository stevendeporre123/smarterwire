// E-mail + wachtwoord. Wachtwoord: PBKDF2-SHA256 (WebCrypto, 100k iteraties = maximum in Workers) met eigen salt.
// Sessie: willekeurig token in een HttpOnly-cookie; in de database staat enkel de SHA-256 ervan.
import { HttpError, json, type Env, type User } from './util';

const ITER = 100_000, SESSION_MS = 30 * 864e5, COOKIE = 'sw_session';
const enc = new TextEncoder();

const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
function same(a: Uint8Array, b: Uint8Array) {
  let d = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const ip = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local';

async function throttle(env: Env, key: string, limit: number, windowMs: number) {
  const r = await env.DB.prepare('SELECT COUNT(*) n FROM auth_attempt WHERE k=? AND at>?').bind(key, Date.now() - windowMs).first<{ n: number }>();
  if ((r?.n ?? 0) >= limit) throw new HttpError(429, 'Te veel pogingen. Probeer het later opnieuw.');
}
const fail = (env: Env, key: string) => env.DB.prepare('INSERT INTO auth_attempt (k, at) VALUES (?, ?)').bind(key, Date.now()).run();

const cookie = (req: Request, value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;

async function startSession(env: Env, req: Request, accountId: string) {
  const token = b64u(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO session (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)').bind(await sha256(token), accountId, now, now + SESSION_MS),
    env.DB.prepare('DELETE FROM session WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM auth_attempt WHERE at<?').bind(now - 864e5),
  ]);
  return cookie(req, token, SESSION_MS / 1000);
}

function tokenOf(req: Request) {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return m?.[1] ?? null;
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const t = tokenOf(req);
  if (!t) return null;
  return env.DB.prepare(
    `SELECT a.id, a.email, a.name, a.role, a.installer, a.prefs FROM session s JOIN account a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(await sha256(t), Date.now()).first<User>();
}

export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, installer: u.installer ? JSON.parse(u.installer) : null, prefs: u.prefs ? JSON.parse(u.prefs) : {} });

const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/;
function creds(b: any) {
  const email = String(b?.email ?? '').trim().toLowerCase(), password = String(b?.password ?? '');
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Ongeldig e-mailadres');
  return { email, password };
}

export async function register(env: Env, req: Request) {
  const b: any = await req.json();
  const { email, password } = creds(b);
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Het wachtwoord moet minstens 8 tekens hebben');
  if (env.INVITE_CODE && String(b?.invite ?? '') !== env.INVITE_CODE) throw new HttpError(403, 'Ongeldige uitnodigingscode');
  await throttle(env, `reg:${ip(req)}`, 5, 36e5);
  await fail(env, `reg:${ip(req)}`);
  if (await env.DB.prepare('SELECT 1 FROM account WHERE email=?').bind(email).first()) throw new HttpError(409, 'Dit e-mailadres is al in gebruik');

  const id = crypto.randomUUID(), salt = crypto.getRandomValues(new Uint8Array(16));
  const first = ((await env.DB.prepare('SELECT COUNT(*) n FROM account').first<{ n: number }>())?.n ?? 0) === 0;
  const stmts = [env.DB.prepare('INSERT INTO account (id,email,name,role,pass_hash,pass_salt,pass_iter,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, email, String(b?.name ?? '').trim().slice(0, 100) || null, 'installer', b64u(await pbkdf2(password, salt, ITER)), b64u(salt), ITER, Date.now())];
  // de eerste gebruiker neemt de projecten over die vóór de invoering van accounts bestonden
  if (first) stmts.push(env.DB.prepare('UPDATE project SET installer_id=? WHERE installer_id IS NULL').bind(id), env.DB.prepare('UPDATE asset SET installer_id=? WHERE installer_id IS NULL').bind(id));
  await env.DB.batch(stmts);
  const user = (await env.DB.prepare('SELECT id,email,name,role,installer,prefs FROM account WHERE id=?').bind(id).first<User>())!;
  return json(publicUser(user), 200, { 'set-cookie': await startSession(env, req, id) });
}

export async function login(env: Env, req: Request) {
  const { email, password } = creds(await req.json());
  await throttle(env, `login:${email}`, 10, 15 * 6e4);
  await throttle(env, `loginip:${ip(req)}`, 40, 15 * 6e4);
  const a = await env.DB.prepare('SELECT * FROM account WHERE email=?').bind(email).first<any>();
  // ook bij een onbekend e-mailadres even rekenen: zo verraadt de responstijd niet of het account bestaat
  const got = await pbkdf2(password.slice(0, 200), a ? unb64u(a.pass_salt) : new Uint8Array(16), a?.pass_iter ?? ITER);
  if (!a || !same(got, unb64u(a.pass_hash))) {
    await fail(env, `login:${email}`); await fail(env, `loginip:${ip(req)}`);
    throw new HttpError(401, 'E-mailadres of wachtwoord is niet juist');
  }
  await env.DB.prepare('DELETE FROM auth_attempt WHERE k=?').bind(`login:${email}`).run();
  return json(publicUser(a), 200, { 'set-cookie': await startSession(env, req, a.id) });
}

export async function logout(env: Env, req: Request) {
  const t = tokenOf(req);
  if (t) await env.DB.prepare('DELETE FROM session WHERE token_hash=?').bind(await sha256(t)).run();
  return json(true, 200, { 'set-cookie': cookie(req, '', 0) });
}

export async function changePassword(env: Env, req: Request, user: User) {
  const b: any = await req.json();
  const next = String(b?.new ?? '');
  if (next.length < 8 || next.length > 200) throw new HttpError(400, 'Het nieuwe wachtwoord moet minstens 8 tekens hebben');
  await throttle(env, `pw:${user.id}`, 10, 15 * 6e4);
  const a = (await env.DB.prepare('SELECT * FROM account WHERE id=?').bind(user.id).first<any>())!;
  if (!same(await pbkdf2(String(b?.current ?? '').slice(0, 200), unb64u(a.pass_salt), a.pass_iter), unb64u(a.pass_hash))) {
    await fail(env, `pw:${user.id}`);
    throw new HttpError(403, 'Huidig wachtwoord is niet juist');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16)), keep = await sha256(tokenOf(req) ?? '');
  await env.DB.batch([
    env.DB.prepare('UPDATE account SET pass_hash=?, pass_salt=?, pass_iter=? WHERE id=?').bind(b64u(await pbkdf2(next, salt, ITER)), b64u(salt), ITER, user.id),
    env.DB.prepare('DELETE FROM session WHERE account_id=? AND token_hash!=?').bind(user.id, keep),   // andere toestellen moeten opnieuw aanmelden
  ]);
  return json(true);
}

const INSTALLER_KEYS = ['name', 'address', 'phone', 'email', 'vat', 'logo'];
export async function saveInstaller(env: Env, req: Request, user: User) {
  const b: any = await req.json(), out: Record<string, string> = {};
  for (const k of INSTALLER_KEYS) out[k] = String(b?.[k] ?? '').slice(0, k === 'logo' ? 400_000 : 500);
  await env.DB.prepare('UPDATE account SET installer=? WHERE id=?').bind(JSON.stringify(out), user.id).run();
  return json(out);
}

export async function savePref(env: Env, req: Request, user: User, key: string) {
  if (!/^\w{1,40}$/.test(key)) throw new HttpError(400, 'Ongeldige sleutel');
  const value = JSON.stringify(((await req.json()) as any)?.value ?? null);
  if (value.length > 20_000) throw new HttpError(413, 'Voorkeur te groot');
  const prefs = { ...(user.prefs ? JSON.parse(user.prefs) : {}), [key]: JSON.parse(value) };
  await env.DB.prepare('UPDATE account SET prefs=? WHERE id=?').bind(JSON.stringify(prefs), user.id).run();
  return json(true);
}
