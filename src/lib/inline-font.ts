import fs from 'node:fs';
import path from 'node:path';

/**
 * The display face, inlined into <head> at build time: it travels with the
 * HTML document itself, so the giant headings paint in their final form on
 * the very first frame - no swap, no reflow, no separate fetch. Body/mono
 * faces stay external with font-display: optional (see global.css).
 */
const woff2 = fs.readFileSync(
  path.resolve('public/fonts/archivo-black-latin-400-normal.woff2'),
);

export const displayFontCss = `@font-face{font-family:'Archivo Black';src:url('data:font/woff2;base64,${woff2.toString(
  'base64',
)}') format('woff2');font-weight:400;font-style:normal;}`;
