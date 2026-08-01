/**
 * Generates Stone-themed OG images: one per locale (home) and one per
 * English case study, into public/og/. Re-run after changing names,
 * titles, or the palette:  node scripts/generate-og.mjs
 */
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = `${root}/public/fonts`;
const outDir = `${root}/public/og`;
mkdirSync(outDir, { recursive: true });

const en = JSON.parse(readFileSync(`${root}/src/i18n/en.json`, 'utf8'));

const LOCALES = [
  { code: 'en', file: 'en.json', dir: 'ltr', font: null },
  { code: 'hi', file: 'hi.json', dir: 'ltr', font: 'noto-sans-devanagari-devanagari-wght-normal.woff2', family: 'Noto Sans Devanagari' },
  { code: 'kn', file: 'kn.json', dir: 'ltr', font: 'noto-sans-kannada-kannada-wght-normal.woff2', family: 'Noto Sans Kannada' },
  { code: 'ur', file: 'ur.json', dir: 'rtl', font: 'noto-nastaliq-urdu-arabic-wght-normal.woff2', family: 'Noto Nastaliq Urdu' },
  { code: 'te', file: 'te.json', dir: 'ltr', font: 'noto-sans-telugu-telugu-wght-normal.woff2', family: 'Noto Sans Telugu' },
  { code: 'ar', file: 'ar.json', dir: 'rtl', font: 'noto-sans-arabic-arabic-wght-normal.woff2', family: 'Noto Sans Arabic' },
  { code: 'hi-latn', file: 'hi-latn.json', dir: 'ltr', font: null },
];

const baseCss = (extraFace, extraFamily, dir) => `
  @font-face { font-family:'Archivo Black'; src:url('file://${fontsDir}/archivo-black-latin-400-normal.woff2') format('woff2'); font-weight:400; }
  @font-face { font-family:'Space Grotesk'; src:url('file://${fontsDir}/space-grotesk-latin-wght-normal.woff2') format('woff2'); font-weight:300 700; }
  ${extraFace}
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1200px; height:630px; background:#131210; color:#efeae1;
    font-family:'Space Grotesk',${extraFamily}sans-serif;
    display:flex; flex-direction:column; justify-content:space-between;
    padding:72px 80px; overflow:hidden; direction:${dir};
  }
  .kicker { color:#928c7f; font-size:22px; letter-spacing:${dir === 'rtl' ? 0 : '0.14em'}; text-transform:uppercase; }
  .name { font-family:'Archivo Black',${extraFamily}sans-serif; font-weight:400; font-size:92px; line-height:1.0; text-transform:uppercase; letter-spacing:-0.02em; margin-top:18px; }
  .sub { font-family:'Space Grotesk',${extraFamily}sans-serif; font-weight:500; font-size:40px; color:#c9c3b6; margin-top:24px; max-width:24ch; line-height:1.3; }
  .foot { display:flex; justify-content:space-between; align-items:baseline; color:#928c7f; font-size:22px; border-top:1px solid #2a2723; padding-top:28px; }
`;

function homeHtml(locale) {
  const catalog = locale.code === 'en' ? en : { ...en, ...JSON.parse(readFileSync(`${root}/src/i18n/${locale.file}`, 'utf8')) };
  const site = { ...en.site, ...(catalog.site ?? {}) };
  const face = locale.font
    ? `@font-face { font-family:'${locale.family}'; src:url('file://${fontsDir}/${locale.font}') format('woff2'); font-weight:100 900; }`
    : '';
  const family = locale.font ? `'${locale.family}',` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(face, family, locale.dir)}</style></head>
  <body>
    <div>
      <p class="kicker">${site.role}</p>
      <h1 class="name">${site.name}</h1>
      <p class="sub">${en.hero.positioning}</p>
    </div>
    <div class="foot"><span>React Native · Node · Postgres · AI</span><span>saifsiddiqui.in</span></div>
  </body></html>`;
}

function workHtml(title) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss('', '', 'ltr')}
    .name { font-size:72px; max-width:16ch; }
  </style></head>
  <body>
    <div>
      <p class="kicker">Case study · Mohd Saif</p>
      <h1 class="name">${title}</h1>
    </div>
    <div class="foot"><span>Problem → Decisions → Outcome</span><span>saifsiddiqui.in</span></div>
  </body></html>`;
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });

for (const locale of LOCALES) {
  await page.setContent(homeHtml(locale), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${outDir}/home-${locale.code}.png` });
  console.log('og: home-' + locale.code);
}

for (const file of readdirSync(`${root}/src/content/work/en`)) {
  const slug = file.replace('.mdx', '');
  const raw = readFileSync(`${root}/src/content/work/en/${file}`, 'utf8');
  const title = raw.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)?.[1] ?? slug;
  await page.setContent(workHtml(title), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${outDir}/work-${slug}.png` });
  console.log('og: work-' + slug);
}

await browser.close();
