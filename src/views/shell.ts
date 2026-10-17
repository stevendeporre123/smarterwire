import { h, icon, btn, toast } from '../lib/dom';
import { formModal, menuButton, type MenuItem } from '../lib/ui';
import { getMe, logout, changePassword } from '../lib/auth';
import { getInstaller, setInstaller, type Installer } from '../domain/settings';

export function topbar(crumb?: string, extra?: Node | null) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('Zap', 18)), h('span', null, 'smarter', h('b', null, 'wire'))),
    crumb && h('div', { class: 'crumb' }, icon('ChevronRight', 14), h('strong', null, crumb)),
    h('span', { class: 'spacer' }),
    extra,
    userMenu(),
  );
}

/** Logo verkleind naar max. 400 px als PNG (data-URL), zodat het in de database en op de PDF past. */
async function logoFromFile(f: File): Promise<string> {
  const bmp = await createImageBitmap(f), k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function editInstaller() {
  const cur = await getInstaller();
  const v: Installer = { ...cur };
  const preview = h('img', { src: v.logo || undefined, style: { maxHeight: '48px', maxWidth: '160px', display: v.logo ? 'block' : 'none', marginTop: '6px' } }) as HTMLImageElement;
  const file = h('input', { type: 'file', accept: 'image/*', onChange: async () => { const f = (file as HTMLInputElement).files?.[0]; if (!f) return; v.logo = await logoFromFile(f); preview.src = v.logo; preview.style.display = 'block'; } });
  formModal({
    title: 'Installateur', wide: true, values: cur,
    fields: [
      { key: 'name', label: 'Naam / firma', span: 2, placeholder: 'bv. Steven De Porre - Smarterhomes' },
      { key: 'address', label: 'Adres', type: 'textarea', span: 2, placeholder: 'Straat en nummer\npostcode gemeente' },
      { key: 'phone', label: 'GSM / telefoon' }, { key: 'email', label: 'E-mail' }, { key: 'vat', label: 'Ondernemingsnummer', span: 2, placeholder: 'BE 0xxx.xxx.xxx' },
    ],
    extra: h('div', null, h('p', { class: 'hint' }, 'Logo (optioneel, rechtsboven in het titelblok):'), file, preview,
      v.logo ? btn('Logo verwijderen', { variant: 'ghost', onClick: () => { v.logo = ''; preview.style.display = 'none'; } }) : null),
    onSave: async (f) => { await setInstaller({ ...EMPTY(), ...f, logo: v.logo } as Installer); toast('Installateur opgeslagen'); },
  });
}
const EMPTY = (): Installer => ({ name: '', address: '', phone: '', email: '', vat: '', logo: '' });

/** Eén accountmenu: installateurgegevens, wachtwoord wijzigen en afmelden. */
function userMenu() {
  const who = h('span', { class: 'hint hide-sm' });
  const items: MenuItem[] = [
    { label: '…', header: true },
    { label: `Build ${new Date(__BUILD_TIME__).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'medium' })}`, header: true },
    { label: 'Installateur', icon: 'HardHat', onClick: editInstaller },
    { label: 'Wachtwoord wijzigen', icon: 'KeyRound', onClick: editPassword },
    { label: 'Afmelden', icon: 'LogOut', onClick: async () => { await logout(); location.hash = '#/'; location.reload(); } },
  ];
  const menu = menuButton({ icon: 'CircleUser', title: 'Account en installateurgegevens' }, items);
  getMe().then((m) => { who.textContent = m.email; menu.querySelector('.menu-head')!.textContent = m.email; }).catch(() => {});
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, who, menu);
}

function editPassword() {
  formModal({
    title: 'Wachtwoord wijzigen', values: {}, saveLabel: 'Wijzigen',
    fields: [{ key: 'current', label: 'Huidig wachtwoord', type: 'password' }, { key: 'next', label: 'Nieuw wachtwoord (min. 8 tekens)', type: 'password' }],
    onSave: async (v) => {
      try { await changePassword(String(v.current ?? ''), String(v.next ?? '')); toast('Wachtwoord gewijzigd'); }
      catch (e: any) { toast(e.message, 'error'); return false; }
    },
  });
}
