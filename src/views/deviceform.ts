import { buildForm, type FieldDef } from '../lib/ui';
import { upsert } from '../db/repo';
import type { Device } from '../domain/model';
import {
  CURVES, DEVICE_KINDS, DIFF_TYPES, deviceTitle, isGroupParent, supplyPhases, supplyPoles, supplyConflict, deviceFieldKeys, defaultModules, normPoles, polesText, type Supply,
} from '../domain/devices';

/**
 * Formulier met enkel de eigenschappen die voor dit soort toestel nodig zijn; elke wijziging wordt meteen bewaard.
 * Gedeeld door de kastweergave en de property inspector van het eendraadschema.
 */
export function deviceForm(d: Device, o: { supply: Supply; devices: Device[]; onChange: (kindChanged: boolean) => void | Promise<void> }) {
  const { supply } = o, parents = o.devices.filter((x) => isGroupParent(x.kind) && x.id !== d.id);
  const all: Record<string, FieldDef> = {
    label: { key: 'label', label: 'Label / opschrift' },
    poles: { key: 'poles', label: 'Aantal polen', type: 'select', options: supplyPoles(supply).map((p) => ({ value: p, label: polesText(p) })), allowEmpty: false },
    modules: { key: 'modules', label: 'Breedte (modules)', type: 'number', step: 0.5 },
    rating_a: { key: 'rating_a', label: 'Nominaal (A)', type: 'number' },
    curve: { key: 'curve', label: 'Curve', type: 'select', options: CURVES },
    sens_ma: { key: 'sens_ma', label: 'Gevoeligheid (mA)', type: 'select', options: [10, 30, 100, 300, 500], numeric: true },
    dtype: { key: 'dtype', label: 'Type diff.', type: 'select', options: DIFF_TYPES },
    trip_ma: { key: 'trip_ma', label: 'Gemeten uitschakelstroom (mA)', type: 'number' },
    trip_ms: { key: 'trip_ms', label: 'Gemeten uitschakeltijd (ms)', type: 'number' },
    breaking_ka: { key: 'breaking_ka', label: 'Onderbrekingsvermogen (kA)', type: 'select', options: [3, 4.5, 6, 10], numeric: true },
    phase: { key: 'phase', label: 'Fase', type: 'select', options: supplyPhases(supply) },
    parent_id: { key: 'parent_id', label: 'Beschermd door', type: 'select', span: 2, options: parents.map((p) => ({ value: p.id, label: deviceTitle(p) + ` (rij ${p.row_no + 1})` })) },
    notes: { key: 'notes', label: 'Notities', type: 'textarea', span: 2 },
  };
  const kindField: FieldDef = { key: 'kind', label: 'Type', type: 'select', allowEmpty: false, span: 2, options: Object.entries(DEVICE_KINDS).map(([value, k]) => ({ value, label: k.label })) };
  const fields = [kindField, ...deviceFieldKeys(d.kind, supply).map((k) => all[k])];
  const form = buildForm(fields, { ...d, poles: normPoles(d.poles) });
  const save = async () => {
    const before = { kind: d.kind, poles: normPoles(d.poles), modules: d.modules };
    Object.assign(d, form.read());
    // standaardwaarden bij een nieuw type: differentieel = type A, automaat = curve C
    if (d.kind !== before.kind) { if ((d.kind === 'differentieel' || d.kind === 'aardlekautomaat') && !d.dtype) d.dtype = 'A'; if ((d.kind === 'automaat' || d.kind === 'aardlekautomaat') && !d.curve) d.curve = 'C'; }
    // breedte volgt de polen enkel zolang ze niet apart is aangepast (een mini-automaat heeft 2 polen op 1 module)
    if (d.modules == null || (d.modules === before.modules && d.modules === defaultModules(before.kind, before.poles) && d.poles !== before.poles)) d.modules = defaultModules(d.kind, d.poles);
    await upsert('device', d);
    await o.onChange(d.kind !== before.kind);
  };
  Object.values(form.inputs).forEach((i) => i.addEventListener('change', save));
  return { el: form.el, conflict: supplyConflict(d, supply) };
}
