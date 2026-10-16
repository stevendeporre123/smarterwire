import { getMe, saveInstaller, type Installer } from '../lib/auth';

/** Gegevens van de installateur (komen op elke PDF-pagina). Eenmalig in te vullen, geldt voor alle projecten van deze gebruiker. */
export type { Installer };
export const EMPTY_INSTALLER: Installer = { name: '', address: '', phone: '', email: '', vat: '', logo: '' };

export const getInstaller = async (): Promise<Installer> => ({ ...EMPTY_INSTALLER, ...((await getMe()).installer ?? {}) });
export const setInstaller = (v: Installer) => saveInstaller(v);

/** Voorkeuren per gebruiker (bv. favorieten in het situatieplan). */
export { getPref as getSetting, setPref as setSetting } from '../lib/auth';
