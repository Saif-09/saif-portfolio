#!/usr/bin/env node
/**
 * Post-build step: teach Vercel's router about Accept negotiation.
 *
 * Runs after `astro build` (see the "build" script). @astrojs/vercel writes
 * .vercel/output/config.json itself via the Build Output API, and that file
 * supersedes vercel.json's routing entirely, so this is the only place the
 * rules can go. See scripts/lib/negotiation-routes.mjs for what they do.
 *
 * The page list is read back out of the build: every .md file the
 * /[...path].md route emitted, minus anything that was simply copied from
 * public/. That way the routes can never claim a page whose markdown twin was
 * not actually built.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { patchVercelConfig } from './lib/negotiation-routes.mjs';
import { pagePathForMd } from '../src/lib/markdown/render.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG = path.join(ROOT, '.vercel/output/config.json');
const STATIC = path.join(ROOT, '.vercel/output/static');
const PUBLIC = path.join(ROOT, 'public');

async function listMarkdown(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listMarkdown(full, base)));
    else if (entry.name.endsWith('.md')) found.push(`/${path.relative(base, full)}`);
  }
  return found;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const built = await listMarkdown(STATIC);

/* public/agents.md and friends are markdown files, not page twins. */
const twins = [];
for (const mdPath of built) {
  if (await exists(path.join(PUBLIC, mdPath.slice(1)))) continue;
  twins.push(mdPath);
}

const pagePaths = twins.map(pagePathForMd).sort();

const config = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
const patched = patchVercelConfig(config, pagePaths);
await fs.writeFile(CONFIG, `${JSON.stringify(patched, null, 2)}\n`);

console.log(
  `[vercel-routes] Accept negotiation wired for ${pagePaths.length} pages ` +
    `(${twins.length} markdown twins).`,
);
