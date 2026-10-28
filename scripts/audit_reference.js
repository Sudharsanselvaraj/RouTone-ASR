const puppeteer = require('/tmp/puppeteer-test/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('artifacts/ui-audit/reference');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('Launching Chrome to inspect live reference https://parley.framer.ai/ ...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1536,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 2 });
  
  await page.goto('https://parley.framer.ai/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  // 1. Capture Hero
  console.log('Capturing Hero...');
  await page.screenshot({ path: path.join(OUT_DIR, '01-hero.png'), clip: { x: 0, y: 0, width: 1536, height: 900 } });

  // 2. Scroll to Feature Cards Section
  console.log('Inspecting Feature Cards Section...');
  // Find cards container or scroll down ~800px
  await page.evaluate(() => {
    window.scrollBy(0, 750);
  });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT_DIR, '02-cards-default.png') });

  // Extract computed styles and inspect card elements
  const cardData = await page.evaluate(() => {
    // Find elements containing 01, 02, 03, 04 or headers
    const cards = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.innerText || '';
      return el.children.length > 1 && (text.includes('01.') || text.includes('02.') || text.includes('03.') || text.includes('04.') || text.includes('Always context-aware'));
    });
    return cards.map(c => ({
      tagName: c.tagName,
      className: c.className,
      rect: c.getBoundingClientRect(),
      bg: window.getComputedStyle(c).backgroundColor,
      borderRadius: window.getComputedStyle(c).borderRadius,
      flex: window.getComputedStyle(c).flex
    }));
  });
  console.log('Card data count:', cardData.length);
  fs.writeFileSync('artifacts/ui-audit/reference_computed_styles.json', JSON.stringify(cardData, null, 2));

  // Try to find the 4 card containers specifically
  const cardHandles = await page.evaluateHandle(() => {
    // Find the 4 siblings containing 01, 02, 03, 04 or card titles
    const all = Array.from(document.querySelectorAll('div'));
    for (const d of all) {
      const children = Array.from(d.children);
      if (children.length === 4) {
        const text = d.innerText;
        if (text.includes('01') && text.includes('02') && text.includes('03') && text.includes('04')) {
          return children;
        }
      }
    }
    return [];
  });

  // Let's get the card bounding boxes and hover/click them one by one
  const cardBoxes = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    for (const d of all) {
      const children = Array.from(d.children);
      if (children.length === 4 && d.innerText.includes('01') && d.innerText.includes('02')) {
        return children.map((c, i) => {
          const r = c.getBoundingClientRect();
          return { index: i, x: r.x, y: r.y, width: r.width, height: r.height };
        });
      }
    }
    return [];
  });

  console.log('Card boxes found:', cardBoxes);

  if (cardBoxes.length === 4) {
    for (let i = 0; i < 4; i++) {
      const box = cardBoxes[i];
      console.log(`Hovering Card ${i + 1} at (${box.x + box.width / 2}, ${box.y + box.height / 2})...`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(600);
      await page.screenshot({ path: path.join(OUT_DIR, `0${3 + i}-card-0${i + 1}-active.png`) });
    }
  }

  // 3. Capability section
  console.log('Scrolling to capability showcase...');
  await page.evaluate(() => {
    window.scrollBy(0, 800);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT_DIR, '07-capability-states.png') });

  // 4. Integrations section
  console.log('Scrolling to integrations...');
  await page.evaluate(() => {
    window.scrollBy(0, 800);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT_DIR, '08-process-tabs.png') });

  // 5. Final CTA and Footer
  console.log('Scrolling to bottom...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT_DIR, '09-faq-open.png') });

  await browser.close();
  console.log('Finished reference audit captures!');
})();
