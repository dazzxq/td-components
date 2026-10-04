// dcms2 ↔ td-media-picker parity screenshots (dev tool, not part of `npm test`).
// Needs: the dcms2 harness served on DCMS_URL (see harness.html) and `npx vite --port 5197` for TD_URL.
// Usage: node docs/internal/research/dcms2-media-picker/shoot.mjs <outDir>
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.argv[2] || 'parity-shots';
const DCMS_URL = process.env.DCMS_URL || 'http://127.0.0.1:5198/index.html';
const TD_URL = process.env.TD_URL || 'http://localhost:5197/demo.html';
const SIZES = [['desktop', 1440, 900], ['mobile', 390, 844]];
fs.mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

async function dcmsPage(w, h, setup) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(DCMS_URL, { waitUntil: 'networkidle' });
  if (setup) await page.evaluate(setup);
  await page.waitForFunction(() => window.DCMS && window.DCMS.MediaPicker, null, { timeout: 10000 });
  return page;
}

async function dcms(name, w, h) {
  let page = await dcmsPage(w, h);
  await page.click('#open');
  await pause(1500);
  await page.screenshot({ path: `${OUT}/dcms-${name}-open.png` }); // mobile: auto-selected item → preview covers all
  const cards = page.locator('.dcms-media-card');
  if (name === 'mobile') {
    // dcms2 has no way out of the mobile preview; strip the class to see the grid underneath
    await page.evaluate(() => document.querySelector('.dcms-media-picker-preview')?.classList.remove('mobile-active'));
    await pause(500);
  } else {
    await cards.nth(1).click();
    await pause(900);
    await cards.nth(3).hover();
    await pause(300);
  }
  await page.screenshot({ path: `${OUT}/dcms-${name}-selected.png` });
  await page.locator('.dcms-media-picker-toolbar button', { hasText: 'Upload' }).first().click({ force: true });
  await pause(700);
  await page.screenshot({ path: `${OUT}/dcms-${name}-upload.png` });
  await page.getByText('Upload từ URL').first().click({ force: true });
  await page.locator('input[placeholder="https://example.com/image.jpg"]').first().fill('khong-hop-le');
  await pause(300);
  await page.screenshot({ path: `${OUT}/dcms-${name}-url.png` });
  await page.close();

  page = await dcmsPage(w, h);
  await page.click('#open-multi');
  await pause(1500);
  for (const i of [0, 2, 5]) {
    await page.locator('.dcms-media-card').nth(i).locator('.dcms-checkbox-container, .dcms-media-checkbox').first()
      .click({ force: true }).catch(() => {});
    await pause(250);
  }
  await page.screenshot({ path: `${OUT}/dcms-${name}-multi.png` });
  await page.close();

  for (const [state, setup] of [['empty', () => { window.__empty = true; }], ['loading', () => { window.__delay = 5000; }]]) {
    page = await dcmsPage(w, h, setup);
    await page.click('#open');
    await pause(state === 'empty' ? 1000 : 600);
    await page.screenshot({ path: `${OUT}/dcms-${name}-${state}.png` });
    await page.close();
  }
}

async function td(name, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(TD_URL, { waitUntil: 'networkidle' });
  await page.click('#demo-mp-open');
  await pause(1500);
  await page.screenshot({ path: `${OUT}/td-${name}-open.png` });
  const items = page.locator('.td-media-picker [data-td-media-item]');
  await items.nth(1).locator('[data-td-media-open]').click();
  await pause(800);
  await page.screenshot({ path: `${OUT}/td-${name}-selected.png` });
  await page.close();
}

for (const [n, w, h] of SIZES) {
  await dcms(n, w, h);
  await td(n, w, h);
}
await browser.close();
console.log(`screenshots → ${OUT}`);
