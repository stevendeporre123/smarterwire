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
export const POLES = ['1P', '1P+N', '2P', '3P', '3P+N', '4P'];
/** Schema-notatie: een 1P+N-automaat is een 2P-toestel, 3P+N is 4P. */
export const polesLabel = (p?: string | null) => (p === '1P+N' ? '2P' : p === '3P+N' ? '4P' : p ?? '');
export const DIFF_TYPES = ['AC', 'A', 'F', 'B'];
export const FUNCTIONS = [
  'Verlichting', 'Stopcontacten', 'Kookplaat', 'Oven', 'Wasmachine', 'Droogkast', 'Vaatwasser',
  'Boiler', 'Verwarming', 'Airco / warmtepomp', 'Laadpaal', 'Buiten', 'Bel / laagspanning', 'Andere',
];
export const CABLE_TYPES = ['VOB', 'XVB', 'XGB', 'EXVB', 'XVB-F2', 'H07V-U', 'H07V-K', 'YMvK', 'Onbekend'];
export const FIRE_CLASSES = ['Eca', 'Dca', 'Cca', 'B2ca', 'Fca', 'Onbekend'];
export const INSTALL_MODES = ['In muur', 'Op muur', 'In buis', 'Los'];
export const SUPPLIES = [{ value: '1x230', label: 'Monofasig 230 V' }, { value: '3N400', label: 'Driefasig 3N 400 V' }, { value: '3x230', label: 'Driefasig 3x230 V (geen nul)' }];
export const PHASES = ['L1', 'L2', 'L3', '3P'];

// ---- voeding: bepaalt welke polen/fases mogelijk zijn ----
export type Supply = '1x230' | '3N400' | '3x230';
/** Zonder ingevulde voeding gaan we uit van monofasig (de strengste keuze). */
export const supplyOf = (p?: { supply?: string | null } | null): Supply => ((p?.supply as Supply) || '1x230');
export const isThreePhase = (s: Supply) => s !== '1x230';
export const supplyPhases = (s: Supply) => (s === '1x230' ? ['L1'] : ['L1', 'L2', 'L3', '3P']);
export const supplyPoles = (s: Supply) => (s === '1x230' ? ['1P', '1P+N', '2P'] : s === '3x230' ? ['1P', '2P', '3P'] : POLES);
export const supplyVoltages = (s: Supply) => (s === '3N400' ? [230, 400] : [230]);
export const supplyLabel = (s: Supply) => SUPPLIES.find((x) => x.value === s)?.label ?? s;
/** Waarschuwing als een toestel niet past bij de voeding (bv. 3P of fase L2 bij monofasig). */
export function supplyConflict(d: { poles?: string | null; phase?: string | null }, s: Supply): string | null {
  if (isThreePhase(s)) return null;
  if (d.poles && !supplyPoles(s).includes(d.poles)) return `${polesLabel(d.poles)} kan niet bij een monofasige voeding`;
  if (d.phase && d.phase !== 'L1') return `fase ${d.phase} kan niet bij een monofasige voeding`;
  return null;
}

/** Standaard aantal modules breed voor een toestel (enkel gebruikt als er geen foto-uitsnede is). */
export const defaultModules = (kind: string, poles?: string | null) =>
  kind === 'overspanning' ? 2 : ({ '1P': 1, '1P+N': 1, '2P': 2, '3P': 3, '3P+N': 4, '4P': 4 } as Record<string, number>)[poles ?? ''] ?? 1;

/** Alleen de eigenschappen die voor dit soort toestel echt nodig zijn. */
export function deviceFieldKeys(kind: string, s: Supply): string[] {
  const phase = isThreePhase(s) ? ['phase'] : [];
  switch (kind) {
    case 'hoofd': return ['label', 'poles', 'rating_a'];
    case 'differentieel': return ['label', 'poles', 'rating_a', 'sens_ma', 'dtype', 'parent_id'];
    case 'aardlekautomaat': return ['label', 'poles', 'rating_a', 'curve', 'sens_ma', 'dtype', 'breaking_ka', ...phase, 'parent_id'];
    case 'automaat': return ['label', 'poles', 'rating_a', 'curve', 'breaking_ka', ...phase, 'parent_id'];
    case 'smelt': return ['label', 'rating_a', ...phase, 'parent_id'];
    case 'overspanning': return ['label', 'poles', 'parent_id'];
    default: return ['label', 'rating_a', ...phase, 'parent_id', 'notes'];
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
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16];
export const STATUSES = ['onbekend', 'gedocumenteerd', 'gecontroleerd'];

/** Gangbare maximum-zekering per kabeldoorsnede (voorstel; altijd zelf nakijken). */
export const DEFAULT_RATING_FOR_SECTION: Record<number, number> = { 1.5: 10, 2.5: 16, 4: 25, 6: 32, 10: 40, 16: 63 };

export function deviceTitle(d: { kind: string; label?: string | null; rating_a?: number | null; curve?: string | null; sens_ma?: number | null }) {
  const bits: (string | number | null | undefined)[] = [d.label];
  if (d.rating_a) bits.push(`${d.curve ?? ''}${d.rating_a}A`);
  else if (d.curve) bits.push(d.curve);
  if (d.sens_ma) bits.push(`${d.sens_ma}mA`);
  const t = bits.filter(Boolean).join(' ');
  return t || DEVICE_KINDS[d.kind]?.label.split(' ')[0] || 'Toestel';
}

const dec = (n: number) => String(n).replace('.', ',');

/** Een kabel is pas volledig als type, doorsnede, brandklasse en plaatsing gekend zijn. */
export function cableMissing(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null }): string[] {
  const m: string[] = [];
  if (!c.cable_type || c.cable_type === 'Onbekend') m.push('type');
  if (!c.section_mm2) m.push('doorsnede');
  if (!c.fire_class || c.fire_class === 'Onbekend') m.push('brandklasse');
  if (!c.install) m.push('plaatsing');
  return m;
}

/** "VOB Eca 3G2,5 · in buis" */
export function cableLabel(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null; wires?: number | null }): string {
  const core = c.section_mm2 ? `${c.wires ? c.wires + 'G' : ''}${dec(c.section_mm2)}` : '';
  const main = [c.cable_type, c.fire_class && c.fire_class !== 'Onbekend' ? c.fire_class : '', core].filter(Boolean).join(' ');
  return [main, c.install?.toLowerCase()].filter(Boolean).join(' · ');
}
