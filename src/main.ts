import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { h, clear, icon, toast } from './lib/dom';
import { renderProjects } from './views/projects';
import { renderProject } from './views/project';

const app = document.getElementById('app')!;

async function route() {
  clear(app);
  const [, kind, id, tab] = location.hash.split('/');
  try {
    if (kind === 'p' && id) await renderProject(app, id, tab || 'kast');
    else await renderProjects(app);
  } catch (e: any) {
    console.error(e);
    app.append(h('div', { class: 'page' }, h('div', { class: 'card card-pad' }, h('h3', null, 'Er ging iets mis'), h('p', null, String(e?.message ?? e)))));
    toast(String(e?.message ?? e), 'error');
  }
}

window.addEventListener('hashchange', route);
route();

export { icon };
