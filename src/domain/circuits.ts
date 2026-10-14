import { sql, type Stmt } from '../db/client';
import { upsertStmt } from '../db/repo';
import { uid } from '../lib/id';
import { isFeeder } from './devices';
import type { Device, Project } from './model';

const letters = (n: number): string => (n < 26 ? String.fromCharCode(65 + n) : letters(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26)));

/** Volgend kringnummer: cijfers als de bestaande kringen cijfers zijn, anders A, B, C… (zoals in een eendraadschema). */
export function nextNr(used: (string | null | undefined)[]): string {
  const have = used.filter(Boolean) as string[];
  if (have.length && have.every((n) => /^\d+$/.test(n))) return String(Math.max(...have.map(Number)) + 1);
  const taken = new Set(have.map((n) => n.toUpperCase()));
  for (let i = 0; ; i++) if (!taken.has(letters(i))) return letters(i);
}

/** Een zekering is altijd een kring: maak er een aan voor elke zekering die er nog geen heeft. */
export async function ensureCircuits(project: Project): Promise<number> {
  const [devs, circuits] = await Promise.all([
    sql.query<Device & { bkind: string }>(
      `SELECT d.*, b.kind bkind FROM device d JOIN board b ON b.id=d.board_id
       WHERE d.deleted=0 AND b.deleted=0 AND b.project_id=? ORDER BY b.kind, b.name, d.row_no, d.pos`, [project.id]),
    sql.query<{ nr: string | null; device_id: string | null; new_device_id: string | null }>(`SELECT nr, device_id, new_device_id FROM circuit WHERE deleted=0 AND project_id=?`, [project.id]),
  ]);
  const linked = new Set(circuits.flatMap((c) => [c.device_id, c.new_device_id]).filter(Boolean) as string[]);
  const used = circuits.map((c) => c.nr);
  const stmts: Stmt[] = [];
  for (const d of devs) {
    if (!isFeeder(d.kind) || linked.has(d.id)) continue;
    const nr = nextNr(used); used.push(nr);
    stmts.push(upsertStmt('circuit', { id: uid(), project_id: project.id, nr, name: `Kring ${nr}`, status: 'onbekend', voltage: 230, has_earth: 1,
      [d.bkind === 'nieuw' ? 'new_device_id' : 'device_id']: d.id }));
  }
  if (stmts.length) await sql.batch(stmts);
  return stmts.length;
}

/** Bij het verwijderen van een zekering: lege automatisch aangemaakte kringen verdwijnen mee, andere kringen blijven bestaan maar los. */
export async function unlinkDevice(deviceId: string) {
  const now = Date.now();
  await sql.run(
    `UPDATE circuit SET deleted=1, updated_at=? WHERE deleted=0 AND (device_id=? OR new_device_id=?) AND name LIKE 'Kring %'
       AND cable_type IS NULL AND NOT EXISTS (SELECT 1 FROM symbol s WHERE s.circuit_id=circuit.id AND s.deleted=0)
       AND (device_id IS NULL OR new_device_id IS NULL)`, [now, deviceId, deviceId]);
  await sql.run(`UPDATE circuit SET device_id=NULL, updated_at=? WHERE deleted=0 AND device_id=?`, [now, deviceId]);
  await sql.run(`UPDATE circuit SET new_device_id=NULL, updated_at=? WHERE deleted=0 AND new_device_id=?`, [now, deviceId]);
}
