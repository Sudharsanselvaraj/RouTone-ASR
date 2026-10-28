const puppeteer = require('/tmp/puppeteer-test/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve('artifacts/ui-audit/reference');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1536,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 2 });
  await page.goto('https://parley.framer.ai/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // Scroll to cards
  const cardsInfo = await page.evaluate(() => {
    // Look for elements with class containing 'framer-z6k7fc' or text '01.', '02.', '03.', '04.'
    const allDivs = Array.from(document.querySelectorAll('div'));
    const cards = allDivs.filter(d => {
      const t = (d.innerText || '').trim();
      return t.startsWith('01.') || t.startsWith('02.') || t.startsWith('03.') || t.startsWith('04.') || t.includes('Always context-aware') || t.includes('Takes real action');
    });
    
    // Also find parent row
    let parent = null;
    for (const d of allDivs) {
      if (d.children.length === 4 && d.innerText.includes('01') && d.innerText.includes('02') && d.innerText.includes('03') && d.innerText.includes('04')) {
        parent = d;
        break;
      }
    }

    let parentInfo = null;
    let childrenInfo = [];
    if (parent) {
      const pr = parent.getBoundingClientRect();
      const ps = window.getComputedStyle(parent);
      parentInfo = {
        x: pr.x, y: pr.y, width: pr.width, height: pr.height,
        display: ps.display, gap: ps.gap, flexDirection: ps.flexDirection
      };
      childrenInfo = Array.from(parent.children).map((c, idx) => {
        const cr = c.getBoundingClientRect();
        const cs = window.getComputedStyle(c);
        return {
          idx,
          x: cr.x, y: cr.y, width: cr.width, height: cr.height,
          bg: cs.backgroundColor,
          borderRadius: cs.borderRadius,
          flex: cs.flex,
          boxShadow: cs.boxShadow,
          text: c.innerText.slice(0, 50)
        };
      });
    }

    return { parentInfo, childrenInfo };
  });

  console.log('Cards Info:', JSON.stringify(cardsInfo, null, 2));
  fs.writeFileSync('artifacts/ui-audit/cards_geometry.json', JSON.stringify(cardsInfo, null, 2));

  if (cardsInfo.parentInfo) {
    // Scroll parent into view
    await page.evaluate((y) => window.scrollTo(0, y - 100), cardsInfo.parentInfo.y + await page.evaluate(() => window.scrollY));
    await new Promise(r => setTimeout(r, 800));

    // Capture default cards state
    await page.screenshot({ path: path.join(OUT_DIR, '02-cards-default.png') });

    // Hover each card and capture
    for (let i = 0; i < cardsInfo.childrenInfo.length; i++) {
      const c = cardsInfo.childrenInfo[i];
      console.log(`Hovering card ${i + 1}...`);
      // Scroll so it's centered
      const currentScrollY = await page.evaluate(() => window.scrollY);
      const cardCenterY = c.y + currentScrollY + c.height / 2;
      const cardCenterX = c.x + c.width / 2;
      
      await page.mouse.move(cardCenterX, cardCenterY - currentScrollY);
      await new Promise(r => setTimeout(r, 600));

      // Inspect style changes on hover
      const hoverStyle = await page.evaluate((idx) => {
        let parent = null;
        for (const d of Array.from(document.querySelectorAll('div'))) {
          if (d.children.length === 4 && d.innerText.includes('01') && d.innerText.includes('02')) {
            parent = d;
            break;
          }
        }
        if (!parent) return null;
        const card = parent.children[idx];
        const cs = window.getComputedStyle(card);
        const cr = card.getBoundingClientRect();
        return {
          width: cr.width,
          height: cr.height,
          bg: cs.backgroundColor,
          flex: cs.flex,
          boxShadow: cs.boxShadow
        };
      }, i);
      console.log(`Card ${i + 1} hover style:`, hoverStyle);

      await page.screenshot({ path: path.join(OUT_DIR, `0${3 + i}-card-0${i + 1}-active.png`) });
    }
  }

  await browser.close();
  console.log('Done cards inspection!');
})();
