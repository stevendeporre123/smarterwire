// Bouwt de testpagina's in tools/ als statische bundel: npx vite build -c tools/vite.test.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  root: '.', optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] }, worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist-test', emptyOutDir: true, rollupOptions: { input: { e2e: 'tools/plan-e2e.html' } } },
});
