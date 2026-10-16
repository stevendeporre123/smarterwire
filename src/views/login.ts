import { h, btn, icon, clear } from '../lib/dom';
import { login, register } from '../lib/auth';

/** Aanmelden / registreren. Na succes wordt de pagina herladen zodat alles met de nieuwe sessie opstart. */
export function renderLogin(app: HTMLElement) {
  clear(app);
  let mode: 'login' | 'register' = 'login';
  const err = h('p', { class: 'hint', style: { color: 'var(--err, #b3261e)', minHeight: '1.2em' } });
  const field = (label: string, attrs: Record<string, any>) => {
    const input = h('input', attrs) as HTMLInputElement;
    return { input, el: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input) };
  };
  const email = field('E-mailadres', { type: 'email', autocomplete: 'username', required: true });
  const pass = field('Wachtwoord', { type: 'password', autocomplete: 'current-password', required: true, minLength: 8 });
  const name = field('Naam of firma', { type: 'text', autocomplete: 'name' });
  const invite = field('Uitnodigingscode (indien je er een kreeg)', { type: 'text', autocomplete: 'off' });
  const extra = h('div', { style: { display: 'grid', gap: '12px', marginTop: '12px' } }, name.el, invite.el);
  const submit = btn('Aanmelden', { icon: 'LogIn', variant: 'primary', type: 'submit' });
  const toggle = h('a', { href: '#', onClick: (e: Event) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; sync(); } });

  function sync() {
    const reg = mode === 'register';
    extra.style.display = reg ? '' : 'none';
    pass.input.autocomplete = reg ? 'new-password' : 'current-password';
    submit.querySelector('span')!.textContent = reg ? 'Account maken' : 'Aanmelden';
    toggle.textContent = reg ? 'Heb je al een account? Meld je aan' : 'Nog geen account? Registreer je';
    err.textContent = '';
  }

  const form = h('form', {
    onSubmit: async (e: Event) => {
      e.preventDefault();
      err.textContent = ''; submit.disabled = true;
      try {
        if (mode === 'login') await login(email.input.value, pass.input.value);
        else await register({ email: email.input.value, password: pass.input.value, name: name.input.value, invite: invite.input.value });
        location.reload();
      } catch (x: any) { err.textContent = x.message; submit.disabled = false; }
    },
  }, h('div', { style: { display: 'grid', gap: '12px' } }, email.el, pass.el), extra, err,
  h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' } }, toggle, submit));

  app.append(h('div', { class: 'shell' }, h('div', { class: 'main' }, h('div', { class: 'page', style: { maxWidth: '420px' } },
    h('div', { class: 'card card-pad' },
      h('a', { class: 'brand', href: '#/', style: { marginBottom: '16px' } }, h('span', { class: 'brand-mark' }, icon('Zap', 18)), h('span', null, 'smarter', h('b', null, 'wire'))),
      form)))));
  sync();
}
