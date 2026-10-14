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
export const DIFF_TYPES = ['AC', 'A', 'F', 'B'];
export const FUNCTIONS = [
  'Verlichting', 'Stopcontacten', 'Kookplaat', 'Oven', 'Wasmachine', 'Droogkast', 'Vaatwasser',
  'Boiler', 'Verwarming', 'Airco / warmtepomp', 'Laadpaal', 'Buiten', 'Bel / laagspanning', 'Andere',
];
export const CABLE_TYPES = ['VOB', 'XVB', 'XVB-F2', 'EXVB', 'H07V-U (buis)', 'H07V-K (buis)', 'YMvK', 'Onbekend'];
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
