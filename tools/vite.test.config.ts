// Bouwt de testpagina's in tools/ als statische bundel: npx vite build -c tools/vite.test.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  root: '.', build: { target: 'es2022', outDir: 'dist-test', emptyOutDir: true, rollupOptions: { input: { e2e: 'tools/plan-e2e.html', pdf: 'tools/pdf-test.html', board: 'tools/board-e2e.html', gen: 'tools/gen-e2e.html', schema: 'tools/schema-e2e.html', circ: 'tools/circuits-e2e.html' } } },
});
