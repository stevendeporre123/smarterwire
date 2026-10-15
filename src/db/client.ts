// Promise-API bovenop de Worker (cloudflare/worker.ts), die de D1-database beheert.
async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error ?? msg; } catch { /* geen JSON */ }
    throw new Error(`Database: ${msg}`);
  }
  return r.json();
}

export type Stmt = { sql: string; bind?: any[] };
export const sql = {
  query: <T = any>(sql: string, bind: any[] = []) => post<T[]>('/api/db/query', { sql, bind }),
  one: async <T = any>(sql: string, bind: any[] = []) => (await post<T[]>('/api/db/query', { sql, bind }))[0] as T | undefined,
  run: (sql: string, bind: any[] = []) => post<any>('/api/db/query', { sql, bind }),
  batch: (stmts: Stmt[]) => post<boolean>('/api/db/batch', { stmts }),
};
