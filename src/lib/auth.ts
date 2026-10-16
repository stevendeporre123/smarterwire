import { api } from '../db/client';

export interface Installer { name: string; address: string; phone: string; email: string; vat: string; logo: string }
export interface Me { id: string; email: string; name: string | null; role: string; installer: Installer | null; prefs: Record<string, unknown> }

let me: Promise<Me> | null = null;
/** Ingelogde gebruiker (gecachet). Gooit AuthError als er niet is aangemeld. */
export const getMe = () => (me ??= api<Me>('GET', '/api/me').catch((e) => { me = null; throw e; }));

export async function login(email: string, password: string) { me = null; return api<Me>('POST', '/api/auth/login', { email, password }); }
export async function register(v: { email: string; password: string; name?: string; invite?: string }) { me = null; return api<Me>('POST', '/api/auth/register', v); }
export async function logout() { await api('POST', '/api/auth/logout', {}); me = null; }
export const changePassword = (current: string, next: string) => api('POST', '/api/auth/password', { current, new: next });
export async function saveInstaller(v: Installer) { const out = await api<Installer>('PUT', '/api/me/installer', v); me = null; return out; }

export async function getPref<T>(key: string, fallback: T): Promise<T> { return ((await getMe()).prefs?.[key] as T | undefined) ?? fallback; }
export async function setPref(key: string, value: unknown) { await api('PUT', `/api/me/prefs/${key}`, { value }); me = null; }
