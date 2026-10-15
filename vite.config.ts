import { defineConfig, type Plugin } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

/** Start de API (wrangler dev met lokale D1 en AI-proxy, poort 8787) samen met de dev-server. */
function api(): Plugin {
  let child: ChildProcess | null = null;
  const stop = () => {
    if (!child?.pid) return;
    // op Windows moet de hele processtructuur weg, anders blijft wrangler draaien
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    child = null;
  };
  return {
    name: 'smarterwire-api',
    apply: 'serve',
    configureServer(server) {
      const vars = existsSync('cloudflare/.dev.vars') ? readFileSync('cloudflare/.dev.vars', 'utf8') : '';
      if (!/ANTHROPIC_API_KEY=\S+/.test(vars)) server.config.logger.warn('[api] Geen ANTHROPIC_API_KEY in cloudflare/.dev.vars: AI-voorstel werkt niet (de database wel).');
      // eerst het schema op de lokale D1 (.wrangler/state) zetten, dan de Worker starten
      mkdirSync('dist', { recursive: true });
      const cfg = '-c cloudflare/wrangler.toml';
      child = spawn(`npx wrangler d1 migrations apply smarterwire --local ${cfg} && npx wrangler dev ${cfg}`, { stdio: ['ignore', 'inherit', 'inherit'], shell: true });
      child.on('exit', (code) => { if (child) server.config.logger.warn(`[api] API gestopt (code ${code}). Staat poort 8787 al in gebruik?`); child = null; });
      server.config.logger.info('[api] API start op http://127.0.0.1:8787');
      server.httpServer?.on('close', stop);
      process.once('exit', stop); process.once('SIGINT', () => { stop(); process.exit(0); }); process.once('SIGTERM', () => { stop(); process.exit(0); });
    },
  };
}

export default defineConfig({
  plugins: [api()],
  // tijdstip van de build, getoond in de footer (controle of de deploy gelukt is)
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  // lokaal: de API (`wrangler dev`, D1 + AI-proxy) draait op 8787
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022' },
});
