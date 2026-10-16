import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { h, loading, icon, toast } from './lib/dom';
import { renderProjects } from './views/projects';
import { renderProject } from './views/project';
import { renderLogin } from './views/login';
import { AuthError } from './db/client';

const app = document.getElementById('app')!;

async function route() {
  loading(app);
  const [, kind, id, tab] = location.hash.split('/');
  try {
    if (kind === 'p' && id) await renderProject(app, id, tab || 'kast');
    else await renderProjects(app);
  } catch (e: any) {
    if (e instanceof AuthError) { renderLogin(app); return; }
    console.error(e);
    app.append(h('div', { class: 'page' }, h('div', { class: 'card card-pad' }, h('h3', null, 'Er ging iets mis'), h('p', null, String(e?.message ?? e)))));
    toast(String(e?.message ?? e), 'error');
  }
}

const built = new Date(__BUILD_TIME__).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'medium' });
document.body.append(h('footer', { class: 'build-info', title: __BUILD_TIME__ }, `Build ${built}`));

window.addEventListener('hashchange', route);
route();

export { icon };
