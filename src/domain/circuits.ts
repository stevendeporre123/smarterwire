import { q, run, type Op } from '../db/client';
import { putOp } from '../db/repo';
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
    q<Device & { bkind: string }>('circuitDevices', { project: project.id }),
    q<{ nr: string | null; device_id: string | null; new_device_id: string | null }>('circuitLinks', { project: project.id }),
  ]);
  const linked = new Set(circuits.flatMap((c) => [c.device_id, c.new_device_id]).filter(Boolean) as string[]);
  const used = circuits.map((c) => c.nr);
  const stmts: Op[] = [];
  for (const d of devs) {
    if (!isFeeder(d.kind) || linked.has(d.id)) continue;
    const nr = nextNr(used); used.push(nr);
    stmts.push(putOp('circuit', { id: uid(), project_id: project.id, nr, name: `Kring ${nr}`, status: 'onbekend', voltage: 230, has_earth: null,
      [d.bkind === 'nieuw' ? 'new_device_id' : 'device_id']: d.id }));
  }
  await run(stmts);
  return stmts.length;
}

/** Bij het verwijderen van een zekering: lege automatisch aangemaakte kringen verdwijnen mee, andere kringen blijven bestaan maar los. */
export const unlinkDevice = (deviceId: string) => run([{ t: 'unlinkDevice', id: deviceId }]);
