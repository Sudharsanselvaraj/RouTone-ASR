const puppeteer = require('/tmp/puppeteer-test/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('artifacts/ui-audit/reference');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1536,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 2 });
  await page.goto('https://parley.framer.ai/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // Scroll so cards are centered in viewport
  await page.evaluate(() => {
    const container = document.querySelector('.framer-MQ6U2');
    if (container) {
      container.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Capture default state
  await page.screenshot({ path: path.join(OUT_DIR, '02-cards-default.png') });
  console.log('Saved 02-cards-default.png');

  // Let's get the 4 card bounding boxes
  const cardBoxes = await page.evaluate(() => {
    const container = document.querySelector('.framer-MQ6U2');
    if (!container) return [];
    return Array.from(container.children).map((c, i) => {
      const r = c.getBoundingClientRect();
      return { idx: i, x: r.x, y: r.y, width: r.width, height: r.height };
    });
  });

  console.log('Card boxes for interaction:', cardBoxes);

  for (let i = 0; i < cardBoxes.length; i++) {
    // Hover Card i
    const freshBox = await page.evaluate((idx) => {
      const container = document.querySelector('.framer-MQ6U2');
      const c = container.children[idx];
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, i);

    console.log(`Hovering card ${i + 1} at (${freshBox.x + freshBox.width / 2}, ${freshBox.y + freshBox.height / 2})`);
    await page.mouse.move(freshBox.x + freshBox.width / 2, freshBox.y + freshBox.height / 2);
    await new Promise(r => setTimeout(r, 600));

    // Also click to test if click is required or hover
    await page.mouse.click(freshBox.x + freshBox.width / 2, freshBox.y + freshBox.height / 2);
    await new Promise(r => setTimeout(r, 500));

    const filename = `0${3 + i}-card-0${i + 1}-active.png`;
    await page.screenshot({ path: path.join(OUT_DIR, filename) });
    console.log(`Saved ${filename}`);

    // Inspect styles of cards when card i is active
    const state = await page.evaluate((activeIdx) => {
      const container = document.querySelector('.framer-MQ6U2');
      return Array.from(container.children).map((c, idx) => {
        const r = c.getBoundingClientRect();
        // find card inner surface
        const inner = c.querySelector('div') || c;
        const cs = window.getComputedStyle(inner);
        return {
          idx,
          isActive: idx === activeIdx,
          width: r.width,
          height: r.height,
          bg: cs.backgroundColor,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow
        };
      });
    }, i);
    console.log(`State when card ${i + 1} active:`, state);
  }

  // Capability showcase
  await page.evaluate(() => {
    // find capability section
    const el = Array.from(document.querySelectorAll('h2, p, span')).find(e => (e.innerText || '').includes('Tell Parley once'));
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '07-capability-states.png') });
  console.log('Saved 07-capability-states.png');

  // Integrations / workflow tabs
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h2, span')).find(e => (e.innerText || '').includes('Connect your workflow'));
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, '08-process-tabs.png') });
  console.log('Saved 08-process-tabs.png');

  await browser.close();
  console.log('Reference capture complete!');
})();
