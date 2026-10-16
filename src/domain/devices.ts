export const DEVICE_KINDS: Record<string, { label: string; short: string; protective: boolean }> = {
  hoofd: { label: 'Hoofdschakelaar / hoofdautomaat', short: 'HS', protective: true },
  differentieel: { label: 'Differentieelschakelaar', short: 'ID', protective: true },
  automaat: { label: 'Automaat', short: 'A', protective: true },
  aardlekautomaat: { label: 'Aardlekautomaat (RCBO)', short: 'AA', protective: true },
  smelt: { label: 'Smeltveiligheid / patroon', short: 'S', protective: true },
  overspanning: { label: 'Overspanningsbeveiliging', short: 'OB', protective: true },
  contactor: { label: 'Contactor / teleruptor', short: 'C', protective: false },
  schakelaar: { label: 'Schakelaar / tijdschakelaar', short: 'SW', protective: false },
  trafo: { label: 'Transformator / voeding', short: 'T', protective: false },
  anders: { label: 'Anders', short: '?', protective: false },
};

/** Toestellen waar kringen onder kunnen hangen (geen verdeler-niveau). */
export const isGroupParent = (kind: string) => kind === 'differentieel' || kind === 'hoofd';
export const isFeeder = (kind: string) => kind !== 'differentieel' && kind !== 'hoofd' && kind !== 'overspanning';

export const CURVES = ['B', 'C', 'D'];
// Aantal polen (1 tot 4) staat los van de breedte in modules (een mini-automaat heeft 2 polen op 1 module) en van het aantal fases.
export const POLES = ['1P', '2P', '3P', '4P'];
/** Oude waarden (1P+N, 3P+N) zijn gewoon 2 en 4 polen. */
export const normPoles = (p?: string | null) => (p === '1P+N' ? '2P' : p === '3P+N' ? '4P' : p ?? '');
export const polesLabel = normPoles;
export const polesText = (p: string) => `${p.replace('P', '')}-polig`;
export const DIFF_TYPES = ['AC', 'A', 'F', 'B'];
export const FUNCTIONS = [
  'Verlichting', 'Stopcontacten', 'Gemengd', 'Kookplaat', 'Oven', 'Wasmachine', 'Droogkast', 'Vaatwasser',
  'Boiler', 'Verwarming', 'Airco / warmtepomp', 'Laadpaal', 'Buiten', 'Bel / laagspanning', 'Andere',
];
export const CABLE_TYPES = ['VOB', 'XVB', 'XGB', 'EXVB', 'EXAVB', 'XVB-F2', 'H07V-U', 'H07V-K', 'H05VV-F', 'H07RN-F', 'YMvK', 'Onbekend'];
export const FIRE_CLASSES = ['Eca', 'Dca', 'Cca', 'B2ca', 'Fca', 'Onbekend'];
/** Waar de leiding ligt (wand, plafond of vloer); of ze los of in een buis zit is een aparte eigenschap. */
export const INSTALL_MODES = ['In wand', 'In plafond', 'In vloer', 'Opbouw (op wand)', 'In kabelgoot', 'In isolatie', 'Ondergronds', 'Onbekend'];
/** Plaatsingen waarvoor het AREI-symbool "in wand/plafond/vloer" (E-vorm) van toepassing is. */
export const IN_WALL_MODES = ['In wand', 'In plafond', 'In vloer'];
export const CONDUIT_MODES = [{ value: 0, label: 'Los' }, { value: 1, label: 'In buis' }];
export const SUPPLIES = [{ value: '1x230', label: 'Monofasig 230 V' }, { value: '3N400', label: 'Driefasig 3N 400 V' }, { value: '3x230', label: 'Driefasig 3x230 V (geen nul)' }];
export const PHASES = ['L1', 'L2', 'L3', '3P'];

// ---- voeding: bepaalt welke polen/fases mogelijk zijn ----
export type Supply = '1x230' | '3N400' | '3x230';
/** Zonder ingevulde voeding gaan we uit van monofasig (de strengste keuze). */
export const supplyOf = (p?: { supply?: string | null } | null): Supply => ((p?.supply as Supply) || '1x230');
export const isThreePhase = (s: Supply) => s !== '1x230';
export const supplyPhases = (s: Supply) => (s === '1x230' ? ['L1'] : ['L1', 'L2', 'L3', '3P']);
export const supplyPoles = (s: Supply) => (s === '1x230' ? ['1P', '2P'] : s === '3x230' ? ['1P', '2P', '3P'] : POLES);
export const supplyVoltages = (s: Supply) => (s === '3N400' ? [230, 400] : [230]);
export const supplyLabel = (s: Supply) => SUPPLIES.find((x) => x.value === s)?.label ?? s;
/** Waarschuwing als een toestel niet past bij de voeding (bv. 3P of fase L2 bij monofasig). */
export function supplyConflict(d: { poles?: string | null; phase?: string | null }, s: Supply): string | null {
  if (isThreePhase(s)) return null;
  if (d.poles && !supplyPoles(s).includes(normPoles(d.poles))) return `${polesLabel(d.poles)} kan niet bij een monofasige voeding`;
  if (d.phase && d.phase !== 'L1') return `fase ${d.phase} kan niet bij een monofasige voeding`;
  return null;
}

/** Standaard aantal modules breed voor een toestel (enkel gebruikt als er geen foto-uitsnede is). */
export const defaultModules = (kind: string, poles?: string | null) =>
  ({ '1P': 1, '2P': 2, '3P': 3, '4P': 4 } as Record<string, number>)[normPoles(poles)] ?? 1;

/** Alleen de eigenschappen die voor dit soort toestel echt nodig zijn. */
export function deviceFieldKeys(kind: string, s: Supply): string[] {
  const phase = isThreePhase(s) ? ['phase'] : [];
  switch (kind) {
    case 'hoofd': return ['label', 'poles', 'modules', 'rating_a'];
    case 'differentieel': return ['label', 'poles', 'modules', 'rating_a', 'sens_ma', 'dtype', 'trip_ma', 'trip_ms', 'parent_id'];
    case 'aardlekautomaat': return ['label', 'poles', 'modules', 'rating_a', 'curve', 'sens_ma', 'dtype', 'trip_ma', 'trip_ms', 'breaking_ka', ...phase, 'parent_id'];
    case 'automaat': return ['label', 'poles', 'modules', 'rating_a', 'curve', 'breaking_ka', ...phase, 'parent_id'];
    case 'smelt': return ['label', 'modules', 'rating_a', ...phase, 'parent_id'];
    case 'overspanning': return ['label', 'poles', 'modules', 'parent_id'];
    default: return ['label', 'modules', 'rating_a', ...phase, 'parent_id', 'notes'];
  }
}
export const INSPECTORS = ['AIB-Vinçotte', 'BTV', 'Keurtech', 'Technics', 'SECO', 'Vinçotte'];
/** Bekende keuringsinstellingen: gegevens worden voorgesteld als je er geen invult. */
export const INSPECTOR_PRESETS: Record<string, string> = {
  Keurtech: 'KEURTECH vzw\nKapelsesteenweg 459\n2180 Ekeren\nBE 0809.589.912\ninfo@keurtech.be\nGSM 0470 50 79 92',
};

/** Stroomtype zoals op een eendraadschema: "3 x 400V + N ~ 50Hz". */
export const supplyText = (s: Supply) => (s === '3N400' ? '3 x 400V + N ~ 50Hz' : s === '3x230' ? '3 x 230V ~ 50Hz' : '1 x 230V + N ~ 50Hz');
/** "20A Voeding - 4 polig" */
export const supplyExtra = (s: Supply, amp?: number | null) => `${amp ? amp + 'A ' : ''}Voeding - ${s === '3N400' ? 4 : s === '3x230' ? 3 : 2} polig`;
/**
 * Voorkeuzekabels voor het kringformulier: één keuze vult type, brandklasse, doorsnede, aantal aders en aarding in.
 * Plaatsing en los/in buis blijven zoals ze zijn. Wat hier niet in staat vul je zelf in ("Aangepast").
 * NB: de brandklasse van VOB (Eca) is een aanname; pas ze aan als de kabel anders gemarkeerd is.
 */
export interface CablePref { id: string; label: string; cable_type: string; fire_class: string; section_mm2: number; wires: number; has_earth: number }
const pref = (type: string, fire: string, wires: number, section: number): CablePref =>
  ({ id: `${type}|${wires}G${section}`, label: `${type} ${fire} ${wires}G${String(section).replace('.', ',')}`, cable_type: type, fire_class: fire, section_mm2: section, wires, has_earth: 1 });
export const CABLE_PREFS: CablePref[] = [
  pref('XVB', 'Cca', 3, 2.5), pref('XVB', 'Cca', 3, 1.5), pref('VOB', 'Eca', 3, 2.5), pref('VOB', 'Eca', 3, 1.5),
  pref('XVB', 'Cca', 3, 4), pref('XVB', 'Cca', 3, 6), pref('XVB', 'Cca', 5, 2.5), pref('XVB', 'Cca', 5, 4), pref('XVB', 'Cca', 5, 6), pref('XVB', 'Cca', 5, 10),
  pref('VOB', 'Eca', 3, 4), pref('VOB', 'Eca', 3, 6), pref('VOB', 'Eca', 5, 2.5), pref('VOB', 'Eca', 5, 6),
];
export const cablePrefOptions = () => CABLE_PREFS.map((p) => ({ value: p.id, label: p.label }));
/** Velden die een voorkeuzekabel instelt. */
export const cablePrefPatch = (id: string) => { const p = CABLE_PREFS.find((x) => x.id === id); return p ? { cable_type: p.cable_type, fire_class: p.fire_class, section_mm2: p.section_mm2, wires: p.wires, has_earth: p.has_earth } : null; };

export const SECTIONS = [0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35];

/** Veelgebruikte kabels voor het palet van het eendraadschema: aantal aders (incl. aarding bij G), aarding, doorsnede. */
export const CABLE_PRESETS: { id: string; wires: number; has_earth: number; section_mm2: number }[] =
  ([[3, 1, 1.5], [3, 1, 2.5], [3, 1, 4], [3, 1, 6], [3, 1, 10], [5, 1, 1.5], [5, 1, 2.5], [5, 1, 4], [5, 1, 6], [5, 1, 10], [4, 0, 10], [4, 0, 16], [4, 1, 10], [4, 1, 16]] as const)
    .map(([wires, has_earth, section_mm2]) => ({ id: `${wires}${has_earth ? 'G' : 'x'}${section_mm2}`, wires, has_earth, section_mm2 }));
export const STATUSES = ['onbekend', 'gedocumenteerd', 'gecontroleerd'];
export const EARTH_MODES = [{ value: 1, label: 'Aanwezig (G)' }, { value: 0, label: 'Afwezig (x)' }];

/** Status volgt de kabelgegevens: "gedocumenteerd" zodra type, doorsnede, brandklasse en plaatsing gekend zijn. "gecontroleerd" blijft een bewuste bevestiging door de installateur. */
export function autoStatus(c: { status?: string | null; cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null }): string {
  if (c.status === 'gecontroleerd' && !cableMissing(c).length) return 'gecontroleerd';
  return cableMissing(c).length ? 'onbekend' : 'gedocumenteerd';
}

/** Gangbare maximum-zekering per kabeldoorsnede (voorstel; altijd zelf nakijken). */
export const DEFAULT_RATING_FOR_SECTION: Record<number, number> = { 1.5: 10, 2.5: 16, 4: 25, 6: 32, 10: 40, 16: 63 };

export function deviceTitle(d: { kind: string; label?: string | null; rating_a?: number | null; curve?: string | null; sens_ma?: number | null }) {
  // het opschrift (bv. "B16") bevat vaak al curve en amperage: niet nog eens bijvoegen ("B16 B16A")
  const label = d.label?.trim() ?? '', low = label.toLowerCase().replace(/s+/g, '');
  const has = (x: string) => !!label && low.includes(x.toLowerCase());
  const bits: (string | number | null | undefined)[] = [label];
  if (d.rating_a) { const spec = `${d.curve ?? ''}${d.rating_a}`; if (!has(spec) && !has(`${d.rating_a}A`) && !has(`${d.rating_a}`)) bits.push(`${spec}A`); }
  else if (d.curve && !has(d.curve)) bits.push(d.curve);
  if (d.sens_ma && !has(`${d.sens_ma}mA`) && !has(`${d.sens_ma}`)) bits.push(`${d.sens_ma}mA`);
  const t = bits.filter(Boolean).join(' ');
  return t || DEVICE_KINDS[d.kind]?.label.split(' ')[0] || 'Toestel';
}

/** Plaats in de kast per toestel: "R1·3" = rij 1, derde toestel van links. Voor dropdowns en lijsten, zodat gelijke toestellen onderscheidbaar zijn. */
export function devicePlaces(devs: { id: string; row_no: number; pos: number }[]): Map<string, string> {
  const out = new Map<string, string>(), rows = new Map<number, typeof devs>();
  for (const d of devs) (rows.get(d.row_no) ?? rows.set(d.row_no, []).get(d.row_no)!).push(d);
  for (const [row, ds] of rows) ds.sort((x, y) => x.pos - y.pos).forEach((d, i) => out.set(d.id, `R${row + 1}·${i + 1}`));
  return out;
}

const dec = (n: number) => String(n).replace('.', ',');

/** Een kabel is pas volledig als type, doorsnede, brandklasse en plaatsing gekend zijn. */
export function cableMissing(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null }): string[] {
  const m: string[] = [];
  if (!c.cable_type || c.cable_type === 'Onbekend') m.push('type');
  if (!c.section_mm2) m.push('doorsnede');
  if (!c.fire_class || c.fire_class === 'Onbekend') m.push('brandklasse');
  if (!c.install || c.install === 'Onbekend') m.push('plaatsing');
  return m;
}

/** "VOB Eca 3G2,5 · in buis" */
export function cableLabel(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null; conduit?: number | null; wires?: number | null; has_earth?: number | null }): string {
  const core = c.section_mm2 ? `${c.wires ? c.wires + (c.has_earth === 0 ? 'x' : c.has_earth === 1 ? 'G' : '?') : ''}${dec(c.section_mm2)}` : '';
  const main = [c.cable_type, c.fire_class && c.fire_class !== 'Onbekend' ? c.fire_class : '', core].filter(Boolean).join(' ');
  const place = [c.install?.toLowerCase(), c.conduit == null ? '' : c.conduit ? 'in buis' : 'los'].filter(Boolean).join(', ');
  return [main, place].filter(Boolean).join(' · ');
}
