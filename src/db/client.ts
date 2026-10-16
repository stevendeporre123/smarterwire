// Data-API van de Worker (cloudflare/worker.ts). Er gaat geen SQL over de lijn: de server controleert bij elke bewerking
// dat het project van de ingelogde gebruiker is.
export class AuthError extends Error {}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = String(r.status);
    try { msg = (await r.json()).error ?? msg; } catch { /* geen JSON */ }
    if (r.status === 401 && !path.startsWith('/api/auth/')) throw new AuthError(msg);
    throw new Error(msg);
  }
  return r.json();
}

export type Where = Record<string, string | number | null | (string | number)[]>;
export type Op =
  | { t: 'put'; table: string; row: Record<string, any> }                       // invoegen of volledig bijwerken
  | { t: 'set'; table: string; id: string; patch: Record<string, any> }          // enkele kolommen van één rij
  | { t: 'where'; table: string; set: Record<string, any>; where: Where }        // meerdere rijen van het eigen project
  | { t: 'unlinkDevice'; id: string };                                           // zekering verwijderd: kringen ontkoppelen

/** Voert bewerkingen atomisch uit. */
export const run = (ops: Op[]) => (ops.length ? api<true>('POST', '/api/db/ops', { ops }) : Promise.resolve(true));
/** Benoemde query (zie cloudflare/data.ts). */
export const q = <T = any>(name: string, args: Record<string, unknown> = {}) => api<T[]>('POST', '/api/db/q', { name, args });
