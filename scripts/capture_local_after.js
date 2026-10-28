const puppeteer = require('/tmp/puppeteer-test/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('artifacts/ui-audit/local-after');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1536,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Hero
  console.log('Capturing local-after/01-hero.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '01-hero.png'), clip: { x: 0, y: 0, width: 1536, height: 900 } });

  // 2. Feature Cards default (Card 01 is active by default)
  console.log('Capturing local-after/02-feature-default.png...');
  await page.evaluate(() => {
    const el = document.getElementById('why-weave');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '02-feature-default.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '03-card-01-active.png') });

  // 3. Hover Card 02
  console.log('Hovering Card 02...');
  const card2Box = await page.evaluate(() => {
    const cards = document.querySelectorAll('.parley-flex-card');
    if (cards.length > 1) {
      const r = cards[1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (card2Box) {
    await page.mouse.move(card2Box.x, card2Box.y);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT_DIR, '04-card-02-active.png') });
  }

  // 4. Hover Card 03
  console.log('Hovering Card 03...');
  const card3Box = await page.evaluate(() => {
    const cards = document.querySelectorAll('.parley-flex-card');
    if (cards.length > 2) {
      const r = cards[2].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (card3Box) {
    await page.mouse.move(card3Box.x, card3Box.y);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT_DIR, '05-card-03-active.png') });
  }

  // 5. Hover Card 04
  console.log('Hovering Card 04...');
  const card4Box = await page.evaluate(() => {
    const cards = document.querySelectorAll('.parley-flex-card');
    if (cards.length > 3) {
      const r = cards[3].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (card4Box) {
    await page.mouse.move(card4Box.x, card4Box.y);
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT_DIR, '06-card-04-active.png') });
  }

  // 6. Capability selection
  console.log('Capturing local-after/07-capability-selection.png...');
  await page.evaluate(() => {
    const el = document.getElementById('workflow');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));
  // Click second workflow tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.parley-workflow-tab-item');
    if (tabs.length > 1) tabs[1].click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT_DIR, '07-capability-selection.png') });

  // 7. Process tabs / Integrations
  console.log('Capturing local-after/08-process-tabs.png...');
  await page.evaluate(() => {
    const el = document.getElementById('integrations');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '08-process-tabs.png') });

  // 8. Empirical Benchmarks
  console.log('Capturing local-after/09-benchmarks.png...');
  await page.evaluate(() => {
    window.scrollBy(0, 750);
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '09-benchmarks.png') });

  // 9. Closing CTA and Footer
  console.log('Capturing local-after/10-closing-cta-footer.png...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '10-closing-cta-footer.png') });

  await browser.close();
  console.log('All local-after captures completed successfully!');
})();
