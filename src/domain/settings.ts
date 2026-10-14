import { sql } from '../db/client';
import { upsert } from '../db/repo';

/** Gegevens van de installateur (komen op elke PDF-pagina). Eenmalig in te vullen, geldt voor alle projecten. */
export interface Installer { name: string; address: string; phone: string; email: string; vat: string; logo: string }
export const EMPTY_INSTALLER: Installer = { name: '', address: '', phone: '', email: '', vat: '', logo: '' };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await sql.one<{ value: string }>('SELECT value FROM setting WHERE id=? AND deleted=0', [key]);
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}
export const setSetting = (key: string, value: unknown) => upsert('setting', { id: key, value: JSON.stringify(value) });

export const getInstaller = () => getSetting<Installer>('installer', EMPTY_INSTALLER);
export const setInstaller = (v: Installer) => setSetting('installer', v);
