import puppeteer from 'puppeteer-core';
const S = '/private/tmp/claude-501/-Users-saifsiddiqui-Developer-Workspace-saif-portfolio/fcbbf90d-26a7-4321-83a5-94bdc853e064/scratchpad';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'shell', args: ['--no-sandbox'] });
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.evaluateOnNewDocument(() => window.localStorage.setItem('studio:key', 'bVAv35ArVcOLCs3a8pl6HPdR'));
await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 2 });
await page.goto('https://saifsiddiqui.in/studio', { waitUntil: 'networkidle0' });
await page.waitForSelector('.studio-thumb', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));

await page.evaluate(() => {
  const ta = document.querySelector('.studio-source');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ta.value.replace('\\section{Summary}', '% browser speed check\n\\section{Summary}'));
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});

const t0 = Date.now();
const btns = await page.$$('.studio-head-right button');
await btns[0].click();

// wait for the Draft switch to enable = the on-screen variant has landed
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const ready = await page.$$eval('.studio-switch button', (e) => !e[1].disabled);
  if (ready) break;
}
console.log(`on-screen variant visible after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// then wait for all four thumbnails to be drafts
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const n = await page.$$eval('.studio-thumb iframe', (e) => e.filter((x) => x.src.startsWith('blob:')).length);
  if (n === 4) break;
}
console.log(`all four thumbnails on draft after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('note under preview:', (await page.$eval('.studio-note', (e) => e.textContent)).trim().slice(0, 120));
await page.screenshot({ path: S + '/studio-fast.png' });
console.log('js errors:', errors.length ? errors : 'none');
await b.close();
