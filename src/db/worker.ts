/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { MIGRATIONS } from './schema';

const PATH = '/smarterwire.sqlite3';
let sqlite3: any;
let pool: any;
let db: any;
let persistent = false;

async function openDb() {
  if (!sqlite3) sqlite3 = await sqlite3InitModule();
  try {
    // OPFS SyncAccessHandle pool: persistent, offline, geen COOP/COEP-headers nodig
    pool ??= await sqlite3.installOpfsSAHPoolVfs({ name: 'smarterwire', initialCapacity: 6 });
    db = new pool.OpfsSAHPoolDb(PATH);
    persistent = true;
  } catch (e) {
    console.warn('OPFS niet beschikbaar, tijdelijke in-memory database', e);
    db = new sqlite3.oo1.DB(':memory:');
    persistent = false;
  }
  db.exec('PRAGMA foreign_keys = ON');
  const v = db.selectValue('PRAGMA user_version') as number;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

const ready = openDb();

type Msg =
  | { id: number; op: 'query'; sql: string; bind?: any[] }
  | { id: number; op: 'batch'; stmts: { sql: string; bind?: any[] }[] }
  | { id: number; op: 'export' }
  | { id: number; op: 'import'; bytes: Uint8Array }
  | { id: number; op: 'info' };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    await ready;
    let result: unknown;
    switch (m.op) {
      case 'query':
        result = db.exec({ sql: m.sql, bind: m.bind, rowMode: 'object', returnValue: 'resultRows' });
        break;
      case 'batch':
        db.transaction(() => {
          for (const s of m.stmts) db.exec({ sql: s.sql, bind: s.bind });
        });
        result = true;
        break;
      case 'export':
        result = pool ? await pool.exportFile(PATH) : sqlite3.capi.sqlite3_js_db_export(db);
        break;
      case 'import':
        if (!pool) throw new Error('Importeren vereist persistente opslag (OPFS)');
        db.close();
        await pool.importDb(PATH, m.bytes);
        await openDb();
        result = true;
        break;
      case 'info':
        result = { persistent, version: sqlite3.version.libVersion };
        break;
    }
    (self as DedicatedWorkerGlobalScope).postMessage({ id: m.id, ok: true, result });
  } catch (err: any) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id: m.id, ok: false, error: String(err?.message ?? err) });
  }
};
