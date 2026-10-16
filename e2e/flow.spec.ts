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
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: '+ Toestel' }).click(); await expect(page.getByText(`${i + 1} toestel`)).toBeVisible().catch(() => {}); }
  await page.getByRole('link', { name: 'Kringen' }).click();
  await expect(page.getByRole('heading', { name: 'Kringen', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);

  // één kring volledig invullen → status wordt vanzelf "gedocumenteerd"
  await page.locator('tbody tr').first().click();
  await modal(page).getByLabel('Omschrijving').fill('Stopcontacten living');
  await modal(page).getByLabel(/Kabeltype/).selectOption('XVB');
  await modal(page).getByLabel(/Brandklasse/).selectOption('Cca');
  await modal(page).getByLabel(/Doorsnede/).selectOption('2.5');
  await modal(page).getByLabel(/Plaatsing/).selectOption('In wand');
  await saved(page);
  await expect(page.getByText('gedocumenteerd').first()).toBeVisible();

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
