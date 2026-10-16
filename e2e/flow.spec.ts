import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Volledige flow als installateur: registreren → project → kast met toestellen → kringen invullen → schema → bevindingen
// → nieuwe kast voorstellen (met oud→nieuw) → PDF downloaden. De AI-analyse wordt niet getest (vraagt een sleutel).

const modal = (page: Page) => page.locator('dialog[open]');
const saved = async (page: Page, label: RegExp | string = 'Opslaan') => { await modal(page).getByRole('button', { name: label, exact: typeof label === 'string' }).click(); await expect(modal(page)).toHaveCount(0); };

test('volledige flow: project → kast → kringen → schema → nieuwe kast → PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  // registreren (open registratie in de lokale omgeving)
  await page.goto('/');
  await page.getByRole('link', { name: /registreer je/i }).click();
  await page.getByLabel('E-mailadres').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Wachtwoord').fill('e2e-wachtwoord-123');
  await page.getByLabel('Naam of firma').fill('E2E Installatie');
  await page.getByRole('button', { name: 'Account maken' }).click();
  await expect(page.getByRole('heading', { name: 'Projecten', exact: true })).toBeVisible();

  // project
  await page.getByRole('button', { name: 'Nieuw project' }).first().click();
  await modal(page).getByLabel('Projectnaam').fill('E2E Janssens');
  await modal(page).getByLabel('Naam eigenaar (plaats van de installatie)').fill('Familie Janssens');
  await saved(page);
  await expect(page.getByText('Begin met een foto van de zekeringskast')).toBeVisible();

  // kast met drie toestellen (zonder foto)
  await page.getByRole('button', { name: 'Bestaande kast toevoegen' }).click();
  await saved(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Meer: toestel/ }).click();
    await page.getByRole('menuitem', { name: 'Toestel toevoegen' }).click();
    await expect(page.locator('.side h3')).toBeVisible();
  }
  // schermafdrukken van de werkbalk (bureaublad en gsm) ter controle
  await page.screenshot({ path: 'test-results/kast-bureaublad.png' });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: 'test-results/kast-gsm.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  // foto van de beschrijvingen → AI (gemockt) koppelt de teksten aan de zekeringen in volgorde
  await page.route('**/api/analyze-labels', async (route) => {
    const { devices } = JSON.parse(route.request().postData() ?? '{}') as { devices: { id: string }[] };
    const text = ['Stopcontacten living', 'Verlichting keuken', 'Wasmachine'];
    await route.fulfill({ json: { labels: devices.map((d, i) => ({ device_id: d.id, text: text[i], confidence: 0.9 })) } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByRole('button', { name: /Foto.s/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), modal(page).getByRole('button', { name: 'Camera' }).last().click()]);
  await chooser.setFiles({ name: 'legende.png', mimeType: 'image/png', buffer: png });
  await expect(modal(page).getByRole('heading', { name: /Beschrijvingen koppelen/ })).toBeVisible();
  await expect(modal(page).locator('tbody tr')).toHaveCount(3);
  await modal(page).getByRole('button', { name: 'Toepassen' }).click();
  await expect(modal(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Foto.s/ }).click();
  await expect(modal(page).locator('figcaption', { hasText: 'Beschrijvingen / legende' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Sluiten' }).last().click();

  await page.getByRole('link', { name: 'Kringen' }).click();
  await expect(page.getByRole('heading', { name: 'Kringen', exact: true })).toBeVisible();
  await expect(page.locator('tbody input.inline-edit').first()).toHaveValue('Stopcontacten living');
  await expect(page.locator('tbody select.inline-edit').first()).toHaveValue('Stopcontacten');
  await expect(page.locator('tbody tr')).toHaveCount(3);

  // één kring volledig invullen → status wordt vanzelf "gedocumenteerd"
  await page.locator('tbody tr').first().click();
  await modal(page).getByLabel('Omschrijving').fill('Stopcontacten living');
  // voorkeuzekabel vult type, brandklasse, doorsnede, aders en aarding in
  await modal(page).getByLabel(/Voorkeuzekabel/).selectOption('XVB|3G2.5');
  await expect(modal(page).getByLabel(/Kabeltype/)).toHaveValue('XVB');
  await expect(modal(page).getByLabel(/Brandklasse/)).toHaveValue('Cca');
  await expect(modal(page).getByLabel(/Doorsnede/)).toHaveValue('2.5');
  await expect(modal(page).getByLabel(/Aantal aders/)).toHaveValue('3');
  await expect(modal(page).getByLabel(/^Aarding/)).toHaveValue('1');
  await modal(page).getByLabel('Functie').selectOption('Gemengd');
  await modal(page).getByLabel(/Plaatsing/).selectOption('In wand');
  await saved(page);
  await expect(page.locator('tbody .badge', { hasText: 'gedocumenteerd' })).toHaveCount(1);

  // inline bewerken, filteren en Excel-export van de kringen
  const naam = page.locator('tbody tr').nth(1).locator('input.inline-edit');
  await naam.fill('Verlichting hall'); await naam.blur();
  await expect(page.getByText('Opgeslagen').first()).toBeVisible();
  await page.locator('select[title="Alle statussen"]').selectOption('gedocumenteerd');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('select[title="Alle statussen"]').selectOption('');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  const { unzipSync, strFromU8 } = await import('fflate');
  const parts = unzipSync(new Uint8Array(fs.readFileSync((await xlsx.path())!)));
  expect(Object.keys(parts)).toContain('xl/worksheets/sheet2.xml');
  expect(strFromU8(parts['xl/worksheets/sheet1.xml'])).toContain('Stopcontacten living');
  expect(strFromU8(parts['xl/worksheets/sheet2.xml'])).toContain('Verlichting hall');

  // eendraadschema en bevindingen laden zonder fout
  await page.getByRole('link', { name: 'Eendraadschema' }).click();
  await expect(page.locator('.schema-wrap > svg').first()).toBeVisible();
  await page.getByRole('link', { name: 'Bevindingen' }).click();
  await expect(page.getByRole('heading', { name: 'Bevindingen', exact: true })).toBeVisible();
  await expect(page.getByText('Er ging iets mis')).toHaveCount(0);

  // nieuwe kast voorstellen
  await page.getByRole('link', { name: 'Zekeringskast' }).click();
  await page.getByRole('button', { name: 'Nieuwe kast voorstellen' }).click();
  await modal(page).getByRole('button', { name: 'Opbouwen', exact: true }).click();
  // opmerkingen (OK) en daarna het oud→nieuw-overzicht (Sluiten)
  await expect(modal(page).getByRole('heading', { name: 'Opmerkingen' })).toBeVisible({ timeout: 30_000 });
  await modal(page).getByRole('button', { name: 'OK' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Oud → nieuw' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Sluiten' }).last().click();
  await expect(modal(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Materiaallijst' })).toBeVisible();

  // PDF-download
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), modal(page).getByRole('button', { name: 'PDF downloaden' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  expect(errors, errors.join('\n')).toEqual([]);
});
