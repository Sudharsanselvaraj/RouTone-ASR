const puppeteer = require('/tmp/puppeteer-test/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('artifacts/ui-audit/local-before');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1536,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Hero
  await page.screenshot({ path: path.join(OUT_DIR, '01-hero.png'), clip: { x: 0, y: 0, width: 1536, height: 900 } });
  console.log('Saved local-before/01-hero.png');

  // 2. Cards
  await page.evaluate(() => {
    const el = document.getElementById('why-weave');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '02-cards-default.png') });
  console.log('Saved local-before/02-cards-default.png');

  // 3. Capability
  await page.evaluate(() => {
    const el = document.getElementById('workflow');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '03-capability.png') });
  console.log('Saved local-before/03-capability.png');

  // 4. Integrations
  await page.evaluate(() => {
    const el = document.getElementById('integrations');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '04-integrations.png') });
  console.log('Saved local-before/04-integrations.png');

  // 5. Benchmarks
  await page.evaluate(() => {
    window.scrollBy(0, 750);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '05-benchmarks.png') });
  console.log('Saved local-before/05-benchmarks.png');

  // 6. Footer
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '06-footer.png') });
  console.log('Saved local-before/06-footer.png');

  await browser.close();
  console.log('Local-before capture complete!');
})();
