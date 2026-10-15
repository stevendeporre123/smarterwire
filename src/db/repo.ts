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
// Bytes staan in D1 (tabel asset) en worden via de Worker geserveerd; D1 laat max. 2 MB per rij toe.
const MAX_BYTES = 1_800_000;

/** Verkleint een afbeelding (max 2400px), slaat ze op als JPEG en geeft id + afmetingen terug. */
export async function saveImage(file: Blob, maxPx = 2400): Promise<{ id: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  let k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height)), q = 0.85;
  for (;;) {
    const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', q));
    if (blob.size > MAX_BYTES && (q > 0.5 || k > 0.3)) { if (q > 0.5) q -= 0.1; else k *= 0.8; continue; }
    const id = uid();
    const r = await fetch(`/api/asset/${id}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-width': String(width), 'x-height': String(height) }, body: blob });
    if (!r.ok) throw new Error(`Foto opslaan mislukt (${r.status})`);
    return { id, width, height };
  }
}

/** Foto's zijn onveranderlijk (nieuw id bij elke upload) en worden door de browser gecachet. */
export async function assetUrl(id: string | null | undefined): Promise<string | null> {
  return id ? `/api/asset/${id}` : null;
}

export async function assetSize(id: string) {
  return sql.one<{ width: number; height: number }>('SELECT width,height FROM asset WHERE id=?', [id]);
}
