import { defineConfig, type Plugin } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** Start de AI-proxy (wrangler dev, poort 8787) samen met de dev-server. Overslaan met NO_AI=1 (of `npm run dev:app`). */
function aiProxy(): Plugin {
  let child: ChildProcess | null = null;
  const stop = () => {
    if (!child?.pid) return;
    // op Windows moet de hele processtructuur weg, anders blijft wrangler draaien
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    child = null;
  };
  return {
    name: 'smarterwire-ai-proxy',
    apply: 'serve',
    configureServer(server) {
      if (process.env.NO_AI || server.config.mode === 'app') return;
      const vars = existsSync('cloudflare/.dev.vars') ? readFileSync('cloudflare/.dev.vars', 'utf8') : '';
      if (!/ANTHROPIC_API_KEY=\S+/.test(vars)) { server.config.logger.warn('[ai] Geen ANTHROPIC_API_KEY in cloudflare/.dev.vars: de AI-proxy wordt niet gestart (AI-voorstel werkt dan niet).'); return; }
      child = spawn('npx wrangler dev -c cloudflare/wrangler.toml', { stdio: ['ignore', 'inherit', 'inherit'], shell: true });
      child.on('exit', (code) => { if (child) server.config.logger.warn(`[ai] AI-proxy gestopt (code ${code}). Staat poort 8787 al in gebruik?`); child = null; });
      server.config.logger.info('[ai] AI-proxy start op http://127.0.0.1:8787');
      server.httpServer?.on('close', stop);
      process.once('exit', stop); process.once('SIGINT', () => { stop(); process.exit(0); }); process.once('SIGTERM', () => { stop(); process.exit(0); });
    },
  };
}

export default defineConfig({
  plugins: [aiProxy()],
  // sqlite-wasm laadt zijn .wasm zelf; niet voorbundelen
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // lokaal: de AI-proxy (`wrangler dev` in /cloudflare) draait op 8787
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022' },
});
