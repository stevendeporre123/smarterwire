import { defineConfig } from 'vite';

export default defineConfig({
  // sqlite-wasm laadt zijn .wasm zelf; niet voorbundelen
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // lokaal: `wrangler dev` in /cloudflare draait op 8787
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022' },
});
