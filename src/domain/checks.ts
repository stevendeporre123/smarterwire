// Controles op een installatie met bevindingen (fout / waarschuwing / info), elk met uitleg en een voorgestelde oplossing.
// LET OP: dit zijn indicatieve vuistregels uit de Belgische installatiepraktijk. Ze vervangen de keuring niet; de verwijzing naar de
// artikels van het AREI is er nog niet bij en moet per regel eerst tegen de officiële tekst nagekeken worden (zie `source`).
import type { Circuit, Device } from './model';
import { cableMissing, deviceTitle, isFeeder } from './devices';
import { splitType, symbolEntry } from './areisymbols';

export type Level = 'fout' | 'waarschuwing' | 'info';
export interface Finding {
  id: string; rule: string; level: Level; state: 'bestaand' | 'nieuw';
  circuitId?: string; deviceId?: string;
  title: string; why: string; fix: string;
  /** Herkomst van de regel; wordt een artikelverwijzing zodra die geverifieerd is. */
  source: string;
}
export interface CheckLoad { circuit_id?: string | null; type: string; n?: number | null }
export interface CheckInput { circuits: Circuit[]; devices: Device[]; loads: CheckLoad[]; projectSupplyAmp?: number | null; earthOhm?: number | null }

const SRC = 'Vuistregel (AREI-artikel nog te verifiëren)';
/** Maximale zekering per kabeldoorsnede (mm² → A), indicatief voor gangbare leggingen. */
const MAX_A: Record<number, number> = { 0.75: 6, 1: 10, 1.5: 16, 2.5: 20, 4: 25, 6: 32, 10: 40, 16: 63, 25: 80, 35: 100 };
const BIG: [RegExp, string][] = [
  [/wasmachine/i, 'wasmachine'], [/droogkast|droogtrommel|droger/i, 'droogkast'], [/vaatwas/i, 'vaatwasser'], [/kookplaat|kookfornuis|fornuis|inductie/i, 'kookplaat'],
  [/oven/i, 'oven'], [/boiler|waterverwarmer/i, 'boiler'], [/warmtepomp|airco/i, 'warmtepomp'], [/laadpaal|laadstation/i, 'laadpaal'], [/verwarmingstoestel|elektrische verwarming|convector/i, 'verwarming'],
];
export const bigKinds = (text: string) => new Set(BIG.filter(([re]) => re.test(text)).map(([, k]) => k));

/** Beschermend differentieel van een toestel (zelf een aardlekautomaat, of het eerste differentieel erboven). */
function diffOf(d: Device | undefined, byId: Map<string, Device>): Device | undefined {
  let cur = d, n = 0;
  while (cur && n++ < 8) { if (cur.kind === 'aardlekautomaat' || cur.kind === 'differentieel') return cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  return undefined;
}

export function runChecks(inp: CheckInput): Finding[] {
  const out: Finding[] = [];
  const byId = new Map(inp.devices.map((d) => [d.id, d]));
  const states: ('bestaand' | 'nieuw')[] = ['bestaand', 'nieuw'];
  const add = (f: Omit<Finding, 'id' | 'source'> & { source?: string }) => out.push({ ...f, source: f.source ?? SRC, id: `${f.rule}:${f.state}:${f.circuitId ?? f.deviceId ?? ''}` });
  const loadsOf = (cid: string) => inp.loads.filter((l) => l.circuit_id === cid);
  const cnt = (l: CheckLoad) => Math.max(1, l.n ?? 1);
  const label = (c: Circuit) => `kring ${c.nr ?? ''} ${c.name}`.trim();

  // ---- per kring (los van de kast) ----
  const sharedDev = new Map<string, number>();
  for (const c of inp.circuits) if (c.device_id) sharedDev.set(c.device_id, (sharedDev.get(c.device_id) ?? 0) + 1);

  for (const c of inp.circuits) {
    const loads = loadsOf(c.id), entries = loads.map((l) => ({ l, e: symbolEntry(l.type) }));
    const sockets = entries.filter((x) => x.e?.func === 'Stopcontacten').reduce((s, x) => s + cnt(x.l), 0);
    const lights = entries.filter((x) => x.e?.func === 'Verlichting').reduce((s, x) => s + cnt(x.l), 0);
    const kinds = bigKinds([c.name, c.func ?? '', ...entries.map((x) => splitType(x.l.type).id)].join(' '));
    const hasSockets = sockets > 0 || c.func === 'Stopcontacten';

    for (const state of states) {
      const devId = state === 'bestaand' ? c.device_id : c.new_device_id;
      const dev = devId ? byId.get(devId) : undefined;
      if (state === 'nieuw' && !dev) continue;       // geen nieuwe kast: niets te controleren
      const dif = diffOf(dev, byId);

      // doorsnede versus zekering
      if (dev && dev.rating_a && c.section_mm2) {
        const max = MAX_A[c.section_mm2];
        if (max && dev.rating_a > max) add({ rule: 'doorsnede-zekering', level: dev.rating_a > max * 1.25 ? 'fout' : 'waarschuwing', state, circuitId: c.id,
          title: `${label(c)}: zekering ${deviceTitle(dev)} is te zwaar voor ${c.section_mm2} mm²`,
          why: `Een kabel van ${c.section_mm2} mm² wordt doorgaans beveiligd tot ${max} A; de kabel kan oververhit raken vóór de zekering uitschakelt.`,
          fix: `Plaats een zekering van ${max} A of minder, of vervang de kabel door een grotere doorsnede.` });
      }
      // stopcontacten op 1,5 mm²
      if (hasSockets && c.section_mm2 && c.section_mm2 < 2.5) add({ rule: 'stopcontacten-1_5', level: 'waarschuwing', state, circuitId: c.id,
        title: `${label(c)}: stopcontacten op ${c.section_mm2} mm²`,
        why: 'Stopcontactkringen worden normaal met 2,5 mm² uitgevoerd; 1,5 mm² is bedoeld voor verlichting en kleine verbruikers.',
        fix: 'Controleer de bekabeling. Zet de kring op 2,5 mm², of beperk de zekering en het aantal punten en documenteer de afwijking.' });
      // stopcontacten zonder 30 mA
      if (dev && hasSockets) {
        const sens = dif?.sens_ma;
        if (!dif || (sens != null && sens > 30)) add({ rule: 'stopcontacten-30ma', level: state === 'nieuw' ? 'fout' : 'waarschuwing', state, circuitId: c.id,
          title: `${label(c)}: stopcontacten zonder 30 mA-beveiliging`,
          why: dif ? `Het differentieel (${deviceTitle(dif)}) heeft een gevoeligheid van ${sens} mA; voor stopcontacten wordt 30 mA verwacht.` : 'Er is geen differentieel gevonden boven deze zekering.',
          fix: 'Voeg een 30 mA-differentieel toe of verplaats de kring naar een bestaand 30 mA-differentieel.' });
      }
      // aarding afwezig
      if (c.has_earth === 0 && (hasSockets || kinds.size)) add({ rule: 'aarding-afwezig', level: 'waarschuwing', state, circuitId: c.id,
        title: `${label(c)}: geen beschermgeleider`,
        why: 'Stopcontacten en verbruikstoestellen vereisen een aangesloten beschermgeleider (aarding).',
        fix: 'Vervang de kabel door een kabel mét aarding (G), of laat de kring buiten dienst tot dit opgelost is.' });
      // kring zonder zekering
      if (state === 'bestaand' && !dev) add({ rule: 'geen-zekering', level: 'waarschuwing', state, circuitId: c.id,
        title: `${label(c)}: niet gekoppeld aan een zekering`, why: 'Een kring zonder gekoppelde zekering kan niet in het schema getoond worden.', fix: 'Kies in de kring de zekering in de bestaande kast.' });
      // zekering gedeeld
      if (state === 'bestaand' && c.device_id && (sharedDev.get(c.device_id) ?? 0) > 1) add({ rule: 'gedeelde-zekering', level: 'info', state, circuitId: c.id,
        title: `${label(c)}: deelt de zekering met ${(sharedDev.get(c.device_id) ?? 1) - 1} andere kring(en)`,
        why: 'Meerdere kringen op één zekering komen voor in oude installaties maar zijn niet meer toegelaten in nieuwe.', fix: 'Splits de kringen in de nieuwe kast ("samen houden" als de bekabeling dat vereist).' });
    }

    // aantal punten (los van de kast; enkel gemeld voor de bestaande toestand om dubbels te vermijden)
    if (sockets > 8) add({ rule: 'punten-stopcontacten', level: 'waarschuwing', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: ${sockets} stopcontacten op één kring`,
      why: 'Per stopcontactkring wordt in woningen doorgaans een maximum van 8 stopcontacten aangehouden.', fix: 'Verdeel de stopcontacten over meerdere kringen.' });
    if (lights > 12) add({ rule: 'punten-verlichting', level: 'info', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: ${lights} lichtpunten op één kring`, why: 'Veel lichtpunten op één kring maken storingzoeken moeilijk en geven een groot verlies bij een defect.', fix: 'Overweeg de verlichting over twee kringen te verdelen.' });
    // grote verbruikers
    if (kinds.size > 1) add({ rule: 'grote-verbruikers', level: 'waarschuwing', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: ${[...kinds].join(' + ')} op één kring`,
      why: 'Grote verbruikers (wasmachine, droogkast, kookplaat, oven, boiler…) krijgen elk een eigen kring.', fix: 'Splits de kring: geef elk toestel zijn eigen zekering en kabel.' });
    else if (kinds.size === 1 && hasSockets && sockets > 1) add({ rule: 'grote-verbruiker-stopcontacten', level: 'info', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: ${[...kinds][0]} deelt de kring met ${sockets} stopcontacten`, why: 'Een grote verbruiker hoort op een eigen kring.', fix: 'Voorzie een eigen kring voor dit toestel.' });
    // meetwaarden
    if (c.insulation_mohm != null && c.insulation_mohm < 1) add({ rule: 'isolatie', level: c.insulation_mohm < 0.5 ? 'fout' : 'waarschuwing', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: isolatieweerstand ${c.insulation_mohm} MΩ`, why: 'Een isolatieweerstand onder 1 MΩ (gemeten op 500 V) wijst op slijtage of vocht in de bekabeling.', fix: 'Zoek de oorzaak (beschadigde kabel, vocht, toestel), herstel en meet opnieuw.' });
    // ontbrekende gegevens
    const missing = cableMissing(c);
    if (missing.length) add({ rule: 'gegevens-ontbreken', level: 'info', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: kabelgegevens onvolledig (${missing.join(', ')})`, why: 'Zonder volledige kabelgegevens kan de kring niet als gedocumenteerd gelden en kunnen de controles niet volledig lopen.', fix: 'Vul de ontbrekende gegevens aan in het kringformulier.' });
    if (c.has_earth == null && c.cable_type) add({ rule: 'aarding-onbekend', level: 'info', state: 'bestaand', circuitId: c.id,
      title: `${label(c)}: aarding niet nagekeken`, why: 'Of de beschermgeleider aanwezig is, is nog niet vastgelegd.', fix: 'Controleer op de kabel/het stopcontact en vul "Aarding" in.' });
  }

  // ---- per toestel ----
  for (const d of inp.devices) {
    if (!isFeeder(d.kind) && d.kind !== 'differentieel') continue;
    const state = inp.circuits.some((c) => c.new_device_id === d.id) ? 'nieuw' : 'bestaand';
    if ((d.kind === 'differentieel' || d.kind === 'aardlekautomaat') && d.trip_ma != null && d.sens_ma != null && d.trip_ma > d.sens_ma) add({ rule: 'diff-test-stroom', level: 'fout', state, deviceId: d.id,
      title: `Differentieel ${deviceTitle(d)} schakelt pas uit bij ${d.trip_ma} mA`, why: `Een differentieel van ${d.sens_ma} mA moet uitschakelen bij een lekstroom van hooguit ${d.sens_ma} mA.`, fix: 'Vervang het differentieel.' });
    if ((d.kind === 'differentieel' || d.kind === 'aardlekautomaat') && d.trip_ms != null && d.trip_ms > 300) add({ rule: 'diff-test-tijd', level: 'waarschuwing', state, deviceId: d.id,
      title: `Differentieel ${deviceTitle(d)}: uitschakeltijd ${d.trip_ms} ms`, why: 'Een niet-selectief differentieel moet bij nominale lekstroom binnen 300 ms uitschakelen.', fix: 'Controleer het type (selectief?) en vervang het differentieel als het traag blijft.' });
    if (d.kind === 'differentieel' && d.dtype === 'AC') add({ rule: 'differentieel-ac', level: 'waarschuwing', state, deviceId: d.id,
      title: `Differentieel ${deviceTitle(d)} is type AC`,
      why: 'Type AC detecteert geen pulserende gelijkstroom, zoals bij elektronische toestellen (wasmachine, droogkast, laadpaal, vriezer met omvormer). Voor die toestellen is minstens type A nodig.',
      fix: 'Vervang door een type A (of F) differentieel, zeker voor kringen met wasmachine, droogkast, kookplaat of laadpaal.' });
  }
  if (inp.earthOhm != null && inp.earthOhm > 100) add({ rule: 'aardingsweerstand', level: 'waarschuwing', state: 'bestaand', title: `Aardingsweerstand ${inp.earthOhm} Ω`,
    why: 'Een aardingsweerstand boven 100 Ω is doorgaans te hoog voor een betrouwbare werking van de differentiëlen.', fix: 'Verbeter de aarding (extra paal of lintaarde) en meet opnieuw.' });
  // kast zonder hoofdbeveiliging
  const boardsSeen = new Set(inp.devices.map((d) => d.board_id));
  for (const b of boardsSeen) {
    const ds = inp.devices.filter((d) => d.board_id === b);
    if (ds.length && !ds.some((d) => d.kind === 'hoofd')) {
      const state = ds.some((d) => inp.circuits.some((c) => c.new_device_id === d.id)) ? 'nieuw' : 'bestaand';
      add({ rule: 'hoofdbeveiliging', level: 'info', state, deviceId: ds[0].id, title: 'Geen hoofdschakelaar of hoofdbeveiliging in de kast',
        why: 'In het eendraadschema hoort de beveiliging van de aansluiting (hoofdschakelaar/-automaat) getoond te worden.', fix: 'Voeg een hoofdschakelaar toe aan de kast of vul ze aan via "+ Toestel".' });
    }
  }

  const rank: Record<Level, number> = { fout: 0, waarschuwing: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
