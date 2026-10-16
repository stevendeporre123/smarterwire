// Dialogen (vervangen alert/confirm/prompt): /tools/dialogs-test.html – resultaten in #out
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { alertDialog, confirmDialog, promptDialog, choose } from '../src/lib/ui';
const out = document.createElement('pre'); out.id = 'out'; document.body.append(out);
const log = (k: string, v: unknown) => { out.textContent += `${k}=${JSON.stringify(v)}\n`; };
(window as any).t = {
  confirm: async () => log('confirm', await confirmDialog({ title: 'Toestel verwijderen', message: 'Dit toestel verwijderen?' })),
  prompt: async () => log('prompt', await promptDialog({ title: 'Nieuw plan', label: 'Naam van het plan', value: 'Verdieping 1' })),
  alert: async () => { await alertDialog('Opmerkingen', 'regel 1\nregel 2'); log('alert', 'gesloten'); },
  choose: async () => log('choose', await choose('2 gevonden', 'Wat doen?', [{ key: 'replace', label: 'Vervangen', variant: 'danger' }, { key: 'add', label: 'Toevoegen', variant: 'primary' }])),
};
