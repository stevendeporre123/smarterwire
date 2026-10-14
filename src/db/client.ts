// Promise-API bovenop de SQLite-worker.
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function w(): Worker {
  if (!worker) {
    // ?mem in de URL = tijdelijke database (tests); de naam is de schakelaar naar de worker
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: new URLSearchParams(location.search).has('mem') ? 'mem' : 'db' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w().postMessage({ id, ...msg }, transfer);
  });
}

export type Stmt = { sql: string; bind?: any[] };
export const sql = {
  query: <T = any>(sql: string, bind: any[] = []) => call<T[]>({ op: 'query', sql, bind }),
  one: async <T = any>(sql: string, bind: any[] = []) => (await call<T[]>({ op: 'query', sql, bind }))[0] as T | undefined,
  run: (sql: string, bind: any[] = []) => call<any>({ op: 'query', sql, bind }),
  batch: (stmts: Stmt[]) => call<boolean>({ op: 'batch', stmts }),
  exportDb: () => call<Uint8Array>({ op: 'export' }),
  importDb: (bytes: Uint8Array) => call<boolean>({ op: 'import', bytes }, [bytes.buffer]),
  info: () => call<{ persistent: boolean; version: string }>({ op: 'info' }),
};
