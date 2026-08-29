/**
 * Push ~/job-search/answers.yml up to the site, so the phone drafts from the
 * same facts the Mac does.
 *
 *   npm run answers          push the local file
 *   npm run answers -- --get show what the server currently holds
 *
 * YAML stays the local format because it is the thing Saif edits by hand;
 * the server stores the parsed object.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANSWERS = join(homedir(), 'job-search/answers.yml');

for (const line of existsSync(join(ROOT, '.env'))
  ? readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
  : []) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim();
}

const SITE = process.env.STUDIO_URL ?? 'https://saifsiddiqui.in';
const KEY = process.env.STUDIO_KEY;
if (!KEY) {
  console.error('STUDIO_KEY is not set in .env');
  process.exit(1);
}

const headers = { 'x-studio-key': KEY, 'content-type': 'application/json' };

if (process.argv.includes('--get')) {
  const res = await fetch(`${SITE}/api/apply/answers`, { headers });
  const data = await res.json();
  if (!res.ok) {
    console.error(data.error ?? res.status);
    process.exit(1);
  }
  console.log(data.present ? yamlDump(data.answers) : 'The server has no answers stored yet.');
  process.exit(0);
}

if (!existsSync(ANSWERS)) {
  console.error(`${ANSWERS} does not exist.`);
  process.exit(1);
}

const answers = yamlLoad(readFileSync(ANSWERS, 'utf8'));

/* A TODO left in place would reach a real application form, so say so loudly
   rather than syncing it silently. */
const todos = [];
const walk = (node, path) => {
  if (typeof node === 'string' && node.trim() === 'TODO') todos.push(path);
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
  }
};
walk(answers, '');

const res = await fetch(`${SITE}/api/apply/answers`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ answers }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(data.error ?? `Failed (${res.status})`);
  process.exit(1);
}

console.log(`Pushed answers.yml to ${SITE}`);
if (todos.length > 0) {
  console.log(`\n${todos.length} field(s) still TODO, and forms will ask for these:`);
  for (const path of todos) console.log(`  ${path}`);
}
