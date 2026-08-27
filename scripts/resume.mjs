/**
 * Resume from the terminal.
 *
 *   npm run resume                       status: live URLs, last build, local diff
 *   npm run resume -- ai "<instruction>" change it in plain English, review, commit
 *   npm run resume -- edit               open resume.tex in $EDITOR, then commit
 *   npm run resume -- build              compile all four variants locally (Docker)
 *   npm run resume -- push ["message"]   commit and push resume.tex as it stands
 *   npm run resume -- open [variant]     open a published variant in the browser
 *
 * The `ai` command calls the deployed /api/studio/ai so the prompt and the
 * find/replace safety checks live in exactly one place, shared with the browser
 * studio. Everything else works on the local checkout.
 *
 * Needs STUDIO_KEY in .env (the same key the browser studio asks for).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEX = join(ROOT, 'resume/resume.tex');

const VARIANTS = {
  fullstack: { path: '/resume', pdf: '/Mohd_Saif_Resume.pdf' },
  mobile: { path: '/resume/mobile', pdf: '/Mohd_Saif_Resume_Mobile.pdf' },
  ai: { path: '/resume/ai', pdf: '/Mohd_Saif_Resume_AI.pdf' },
  product: { path: '/resume/product', pdf: '/Mohd_Saif_Resume_Product.pdf' },
};

/* npm does not load .env for plain node scripts, so do it here. Tolerant by
   design: a missing file is fine until a command actually needs a key. */
function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const SITE = process.env.STUDIO_URL ?? 'https://saifsiddiqui.in';
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function die(message) {
  console.error(red(message));
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

function studioKey() {
  const key = process.env.STUDIO_KEY;
  if (!key) {
    die(
      'STUDIO_KEY is not set. Add it to .env (the same value as the Vercel env var\n' +
        'the browser studio asks for).',
    );
  }
  return key;
}

async function studio(path, body) {
  const res = await fetch(`${SITE}/api/studio/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-studio-key': studioKey(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(data.error ?? `${path} failed (${res.status})`);
  return data;
}

function localTex() {
  if (!existsSync(TEX)) die(`${TEX} is missing.`);
  return readFileSync(TEX, 'utf8');
}

function texIsDirty() {
  return git('status', '--porcelain', '--', 'resume/resume.tex').length > 0;
}

/* ------------------------------------------------------------------ status */

async function cmdStatus() {
  console.log(bold('\nPublished variants'));
  await Promise.all(
    Object.entries(VARIANTS).map(async ([id, v]) => {
      let line = dim('unreachable');
      try {
        const res = await fetch(`${SITE}${v.pdf}`, { method: 'HEAD' });
        line = res.ok
          ? `${green('live')}  ${dim(`${(Number(res.headers.get('content-length') ?? 0) / 1024).toFixed(0)} KB`)}`
          : red(`${res.status}`);
      } catch {
        /* offline */
      }
      console.log(`  ${id.padEnd(10)} ${SITE}${v.path.padEnd(18)} ${line}`);
    }),
  );

  console.log(bold('\nLocal source'));
  console.log(
    `  resume/resume.tex  ${texIsDirty() ? red('uncommitted changes') : green('matches HEAD')}`,
  );

  if (process.env.STUDIO_KEY) {
    try {
      const { run } = await studio('status');
      if (run?.status) {
        const state =
          run.status === 'completed'
            ? run.conclusion === 'success'
              ? green('success')
              : red(run.conclusion ?? 'failed')
            : 'running';
        console.log(bold('\nLast build'));
        console.log(`  ${state}  ${dim(run.title ?? '')}`);
        if (run.url) console.log(`  ${dim(run.url)}`);
      }
    } catch {
      /* status is a nicety; never fail the whole command over it */
    }
  }

  console.log(
    dim(`\n  npm run resume -- ai "add a bullet about X"   change it in plain English`),
  );
  console.log(dim('  npm run resume -- edit                       open it in $EDITOR\n'));
}

/* ---------------------------------------------------------------------- ai */

async function cmdAi(instruction) {
  if (!instruction) die('Say what to change: npm run resume -- ai "make the AI summary shorter"');

  if (texIsDirty() && !(await confirm('resume.tex has uncommitted changes. Edit on top of them?'))) {
    process.exit(0);
  }

  const before = localTex();
  console.log(dim('Asking…'));
  const result = await studio('ai', { tex: before, instruction });

  if (result.note) console.log(`\n${result.note}\n`);

  for (const edit of result.applied ?? []) {
    if (edit.why) console.log(bold(edit.why));
    console.log(red(prefix(edit.find, '- ')));
    console.log(green(prefix(edit.replace || '(removed)', '+ ')));
    console.log();
  }

  for (const skipped of result.rejected ?? []) {
    console.log(red(`skipped: ${skipped.reason}`));
    console.log(dim(prefix(skipped.find, '  ')));
  }

  if (result.problems?.length) {
    die(`Not applied, it would have broken the file: ${result.problems.join('; ')}.`);
  }

  if (!result.changed) {
    console.log(dim('No changes made.'));
    return;
  }

  if (!(await confirm('Write this to resume/resume.tex?'))) {
    console.log(dim('Left alone.'));
    return;
  }

  writeFileSync(TEX, result.tex);
  console.log(green('Written.'));

  if (await confirm('Commit and push it (this publishes)?')) {
    await push(`Update resume: ${instruction.slice(0, 80)}`);
  } else {
    console.log(dim('Not pushed. `npm run resume -- push` when you are ready.'));
  }
}

function prefix(text, marker) {
  return text
    .split('\n')
    .map((l) => marker + l)
    .join('\n');
}

/* -------------------------------------------------------------------- edit */

async function cmdEdit() {
  const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'vi';
  const before = localTex();
  spawnSync(editor, [TEX], { stdio: 'inherit' });
  if (localTex() === before) {
    console.log(dim('No changes.'));
    return;
  }
  if (await confirm('Commit and push it (this publishes)?')) await push('Update resume');
}

/* ------------------------------------------------------------------- build */

async function cmdBuild() {
  const hasPdflatex = spawnSync('which', ['pdflatex'], { encoding: 'utf8' }).status === 0;
  if (hasPdflatex) {
    console.log(dim('Building with the local pdflatex…'));
    const r = spawnSync('bash', [join(ROOT, 'resume/build.sh')], { stdio: 'inherit', cwd: ROOT });
    process.exit(r.status ?? 0);
  }

  const dockerUp = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
  if (!dockerUp) {
    die(
      'No local pdflatex and no running Docker.\n' +
        'Either start Docker, `brew install --cask mactex-no-gui`, or just push:\n' +
        'CI builds all four variants on every push to resume/resume.tex.',
    );
  }

  console.log(dim('Building in the TeX Live container (first run pulls ~2 min)…'));
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${ROOT}:${ROOT}`,
      '-w',
      ROOT,
      'ghcr.io/xu-cheng/texlive-full:latest',
      'bash',
      'resume/build.sh',
    ],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 0);
}

/* -------------------------------------------------------------- push, open */

async function push(message) {
  if (!texIsDirty()) {
    console.log(dim('resume.tex already matches HEAD, nothing to push.'));
    return;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') {
    die(`On branch ${branch}. The resume publishes from main.`);
  }
  git('add', 'resume/resume.tex');
  git('commit', '-m', message);
  git('push', 'origin', 'main');
  console.log(green('Pushed. CI is building all four variants; live in about a minute.'));
  console.log(dim(`  ${SITE}/resume`));
}

function cmdOpen(variant = 'fullstack') {
  const v = VARIANTS[variant];
  if (!v) die(`Unknown variant "${variant}". One of: ${Object.keys(VARIANTS).join(', ')}`);
  spawnSync('open', [`${SITE}${v.path}`], { stdio: 'ignore' });
}

/* --------------------------------------------------------------------- cli */

const [command = 'status', ...rest] = process.argv.slice(2);

switch (command) {
  case 'status':
    await cmdStatus();
    break;
  case 'ai':
    await cmdAi(rest.join(' ').trim());
    break;
  case 'edit':
    await cmdEdit();
    break;
  case 'build':
    await cmdBuild();
    break;
  case 'push':
    await push(rest.join(' ').trim() || 'Update resume');
    break;
  case 'open':
    cmdOpen(rest[0]);
    break;
  case 'studio':
    spawnSync('open', [`${SITE}/studio`], { stdio: 'ignore' });
    break;
  default:
    die(
      `Unknown command "${command}".\n` +
        '  npm run resume                       status\n' +
        '  npm run resume -- ai "<instruction>" change it in plain English\n' +
        '  npm run resume -- edit               open in $EDITOR\n' +
        '  npm run resume -- build              compile all variants locally\n' +
        '  npm run resume -- push ["message"]   commit and push\n' +
        '  npm run resume -- open [variant]     open a published variant\n' +
        '  npm run resume -- studio             open the browser studio',
    );
}
