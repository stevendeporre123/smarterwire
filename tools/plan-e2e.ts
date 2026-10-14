// Test van de echte plan-weergave met gesimuleerde klikken: npx vite → http://localhost:5173/tools/plan-e2e.html
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { upsert, saveImage } from '../src/db/repo';
import { renderPlan } from '../src/views/plan';

const log = (m: string) => { let d = document.getElementById('log'); if (!d) { d = document.createElement('pre'); d.id = 'log'; d.style.cssText = 'position:fixed;right:0;top:0;background:#ffd;margin:0;z-index:9;font-size:11px'; document.body.append(d); } d.textContent += m + ' | '; };
window.addEventListener('error', (e) => log('ERR ' + e.message));
window.addEventListener('unhandledrejection', (e) => log('REJ ' + e.reason));
log('start');
(window as any).prompt = () => ((window as any).__answer ?? 'KEUKEN');
(window as any).confirm = () => true;
const PHOTO = location.search.includes('photo');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  log('db…'); const proj: any = await upsert('project', { name: 'Test', supply: '1x230' });
  let plan: any;
  if (PHOTO) {   // nep-plattegrond als foto: schaal nog niet ingesteld
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1100; const g = c.getContext('2d')!;
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 1600, 1100); g.strokeStyle = '#444'; g.lineWidth = 14; g.strokeRect(200, 150, 1100, 700); g.beginPath(); g.moveTo(700, 150); g.lineTo(700, 520); g.stroke();
    const img = await saveImage(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')));
    plan = await upsert('plan', { project_id: proj.id, name: 'Foto', asset_id: img.id, w: img.width, h: img.height });
  } else plan = await upsert('plan', { project_id: proj.id, name: 'GV', w: 3000, h: 2100, scale: 150 });
  log('db ok'); localStorage.setItem(`smarterwire.plan.${proj.id}`, plan.id);
  const root = document.getElementById('root')!;
  await renderPlan(root, proj);
  await sleep(300);
  const svgEl = root.querySelector('.canvas svg') as SVGSVGElement;
  const toClient = (x: number, y: number) => {
    const r = svgEl.getBoundingClientRect(), vb = svgEl.getAttribute('viewBox')!.split(' ').map(Number), s = Math.min(r.width / vb[2], r.height / vb[3]);
    return { clientX: r.left + (r.width - vb[2] * s) / 2 + (x - vb[0]) * s, clientY: r.top + (r.height - vb[3] * s) / 2 + (y - vb[1]) * s };
  };
  const ev = (type: string, x: number, y: number, target?: EventTarget) => { const c = toClient(x, y); (target ?? document.elementFromPoint(c.clientX, c.clientY) ?? svgEl).dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...c })); };
  const click = async (x: number, y: number) => { ev('pointermove', x, y); await sleep(20); ev('pointerdown', x, y); await sleep(40); ev('pointerup', x, y); await sleep(40); };
  const tool = async (label: string) => { [...root.querySelectorAll('.pal-item')].find((b) => b.getAttribute('title') === label || b.textContent?.trim() === label)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(50); };
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  if (PHOTO) {
    // 1) schaal: breedte van de buitenmuur (1100 px) = 11 m
    (window as any).__answer = '11';
    [...root.querySelectorAll('button')].find((x) => x.textContent?.includes('Schaal'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(50);
    await click(200, 150); await click(1300, 150); await sleep(300);
    // 2) muren op de foto natrekken
    await tool('Muur');
    for (const [x, y] of [[200, 150], [1300, 150], [1300, 850], [200, 850], [200, 150]]) await click(x, y);
    key('Escape'); await sleep(50);
    await click(700, 150); await click(700, 520); key('Escape'); await sleep(50);
    await tool('Deur'); await click(1000, 150); await tool('Raam'); await click(450, 850);
    await tool('Selecteren');
    if (location.search.includes('rm')) { [...root.querySelectorAll('button')].find((x) => x.textContent?.includes('Foto verwijderen'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(800); }
  } else {
  await tool('Muur');
  for (const [x, y] of [[300, 300], [1500, 300], [1500, 1200], [300, 1200], [300, 300]]) await click(x, y);
  // tussenmuur, op maat getypt (2,5 m = 375 px)
  await click(900, 300); ev('pointermove', 900, 700); await sleep(20); await click(900, 700);
  key('Escape'); await sleep(50);
  await tool('Raam'); await click(1000, 305); await click(1500, 800);
  await tool('Deur'); await click(300, 800); await click(900, 560);
  await tool('Trap'); ev('pointermove', 1100, 800); ev('pointerdown', 1100, 800); ev('pointermove', 1100, 1180); ev('pointermove', 1250, 1180); await sleep(30); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await sleep(80);
  await tool('Bed'); await click(400, 450);
  await tool('Tafel'); await click(1000, 500);
  await tool('Tekst'); await click(600, 1050);
  await tool('Stopcontact'); await click(335, 400); await click(1480, 600); await click(1000, 1185);
  await tool('Verlichtingstoestel'); await click(700, 700);
  await tool('Selecteren'); await sleep(100);
  await click(900, 400);   // tussenmuur selecteren → zijpaneel met lengte
  const len = root.querySelector('.side input[type=number]') as HTMLInputElement; len.value = '2,5'.replace(',', '.'); len.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
  }
  log('klaar ' + svgEl.querySelectorAll('[data-sid]').length + ' shapes');
} catch (e: any) { log('FOUT ' + (e?.stack ?? e)); }
