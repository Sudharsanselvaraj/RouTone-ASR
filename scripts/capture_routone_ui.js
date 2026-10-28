// Captures every Routone workspace at desktop size plus a narrow viewport.
// Usage: NODE_PATH=<dir with puppeteer-core> node scripts/capture_routone_ui.js [baseUrl]
// Requires the API on :8000 and the web app running; uses the first saved run for populated views.
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:5174';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve('artifacts/routone-ui');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const shot = async (name, full = true) => {
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    console.log('saved', name);
  };
  const go = async (view) => {
    await page.evaluate((v) => { location.hash = `/${v}`; window.scrollTo(0, 0); }, view);
    await sleep(400);
  };

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
  await shot('00-landing', false);

  // Empty states (no recording loaded yet)
  await go('overview'); await sleep(800); await shot('01-overview-empty');
  await go('inspector'); await shot('02-inspector-empty');

  // Open the newest benefit-aware saved run so every workspace has real data.
  await go('overview'); await sleep(600);
  const opened = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const row = rows.find((r) => /Benefit Aware/i.test(r.textContent || '')) || rows[0];
    const btn = row && [...row.querySelectorAll('button')].find((b) => b.textContent === 'Open');
    if (!btn) return false;
    btn.click();
    await new Promise((r) => setTimeout(r, 2500));
    return true;
  });
  if (!opened) throw new Error('No saved run to open; transcribe a demo first.');

  await go('overview'); await shot('03-overview-with-run');
  await go('studio'); await shot('04-asr-studio');
  await go('inspector');
  await page.evaluate(() => document.querySelector('.table-select tbody tr')?.click());
  await sleep(1200); await shot('05-overlap-inspector');
  await go('routing');
  await page.evaluate(() => document.querySelector('.decision-item')?.click());
  await sleep(1200); await shot('06-routing-lab');
  await go('benchmarks'); await sleep(800); await shot('07-benchmarks');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  for (const [v, n] of [['studio', '08-mobile-studio'], ['inspector', '09-mobile-inspector'], ['benchmarks', '10-mobile-benchmarks']]) {
    await go(v); await shot(n);
  }
  console.log(errors.length ? `Console/page errors:\n${errors.join('\n')}` : 'No console or page errors.');
  await browser.close();
})();
