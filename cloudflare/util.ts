export interface Env {
  DB: D1Database; ANTHROPIC_API_KEY: string; MODEL?: string;
  /** Optioneel: indien ingesteld is registreren enkel mogelijk met deze code (testers uitnodigen). */
  INVITE_CODE?: string;
}
export interface User { id: string; email: string; name: string | null; role: string; installer: string | null; prefs: string | null }

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export const ID = /^[\w-]{8,64}$/;
