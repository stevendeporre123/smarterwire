import { sql, type Stmt } from './client';
import { uid } from '../lib/id';

export type Row = Record<string, any> & { id: string };

/** INSERT ... ON CONFLICT DO UPDATE. Zet altijd updated_at (voor sync). */
export function upsertStmt(table: string, obj: Record<string, any>): Stmt {
  const o: Record<string, any> = { ...obj, id: obj.id ?? uid(), updated_at: Date.now() };
  const cols = Object.keys(o);
  const set = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',');
  return {
    sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
          ON CONFLICT(id) DO UPDATE SET ${set}`,
    bind: cols.map((c) => o[c] ?? null),
  };
}

export async function upsert<T extends Record<string, any>>(table: string, obj: T): Promise<T & { id: string }> {
  const withId = { ...obj, id: obj.id ?? uid() };
  const s = upsertStmt(table, withId);
  await sql.run(s.sql, s.bind);
  return withId;
}

export const softDelete = (table: string, id: string) =>
  sql.run(`UPDATE ${table} SET deleted=1, updated_at=? WHERE id=?`, [Date.now(), id]);

export const list = <T = Row>(table: string, where = '1=1', bind: any[] = [], order = 'rowid') =>
  sql.query<T>(`SELECT * FROM ${table} WHERE deleted=0 AND (${where}) ORDER BY ${order}`, bind);

// ---------- assets (foto's, plattegronden) ----------
const urlCache = new Map<string, string>();

/** Verkleint een afbeelding (max 2400px) en slaat ze op als JPEG-blob in SQLite. */
export async function saveImage(file: Blob, maxPx = 2400): Promise<{ id: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.85));
  const data = new Uint8Array(await blob.arrayBuffer());
  const id = uid();
  const s = upsertStmt('asset', { id, mime: 'image/jpeg', width, height, data });
  await sql.run(s.sql, s.bind);
  return { id, width, height };
}

export async function assetUrl(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const hit = urlCache.get(id);
  if (hit) return hit;
  const row = await sql.one<{ mime: string; data: Uint8Array }>('SELECT mime,data FROM asset WHERE id=?', [id]);
  if (!row) return null;
  const url = URL.createObjectURL(new Blob([row.data as BlobPart], { type: row.mime }));
  urlCache.set(id, url);
  return url;
}

export async function assetSize(id: string) {
  return sql.one<{ width: number; height: number }>('SELECT width,height FROM asset WHERE id=?', [id]);
}
