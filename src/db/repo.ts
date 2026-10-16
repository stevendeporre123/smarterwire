import { q, run, type Op, type Where } from './client';
import { uid } from '../lib/id';

export type Row = Record<string, any> & { id: string };

/** Bewerking: invoegen of bijwerken. De server zet updated_at en controleert de eigenaar. */
export const putOp = (table: string, obj: Record<string, any>): Op => ({ t: 'put', table, row: { ...obj, id: obj.id ?? uid() } });
export const setOp = (table: string, id: string, patch: Record<string, any>): Op => ({ t: 'set', table, id, patch });
export const softDeleteOp = (table: string, id: string): Op => setOp(table, id, { deleted: 1 });
export const whereOp = (table: string, set: Record<string, any>, where: Where): Op => ({ t: 'where', table, set, where });

export async function upsert<T extends Record<string, any>>(table: string, obj: T): Promise<T & { id: string }> {
  const op = putOp(table, obj);
  await run([op]);
  return { ...obj, id: (op as any).row.id };
}
export const softDelete = (table: string, id: string) => run([softDeleteOp(table, id)]);

/** Lijst van een tabel per ouder (project, kast, plan). Volgorde ligt vast op de server. */
export const list = <T = Row>(table: string, by: string) => q<T>('list', { table, by });

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
  return (await q<{ width: number; height: number }>('assetSize', { id }))[0];
}
