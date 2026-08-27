/**
 * Compile one resume.tex into every variant, fast.
 *
 * The studio's draft preview used to go through GitHub Actions, where pulling
 * the 2GB TeX image cost ~90 seconds per compile and the pdflatex run itself
 * cost about one. This service exists to remove that: the image is already
 * here, so a request is just the compile.
 *
 * It is deliberately not the publishing path. Publishing still runs through CI
 * on a push to main, so the live resume never depends on this being up.
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.COMPILE_SECRET ?? '';

/* Keep in sync with pdf_name() in resume/build.sh: the studio matches drafts to
   published PDFs by these names. */
const VARIANTS = {
  product: 'Mohd_Saif_Resume.pdf',
  fullstack: 'Mohd_Saif_Resume_Fullstack.pdf',
  mobile: 'Mohd_Saif_Resume_Mobile.pdf',
  ai: 'Mohd_Saif_Resume_AI.pdf',
};

const MAX_TEX_BYTES = 200_000;
const COMPILE_TIMEOUT_MS = 20_000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function authorized(req) {
  if (!SECRET) return false;
  const given = req.headers['x-compile-secret'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });
}

/** pdflatex reports its own page count; nothing else needs to parse the PDF. */
function pageCount(log) {
  const match = /Output written on .*?\((\d+) pages?/.exec(log);
  return match ? Number(match[1]) : null;
}

/** The lines that actually say what went wrong, not the whole 400-line log. */
function errorExcerpt(log) {
  const lines = log.split('\n');
  const first = lines.findIndex((l) => l.startsWith('!'));
  if (first === -1) return lines.slice(-12).join('\n');
  return lines.slice(first, first + 12).join('\n');
}

async function compileVariant(dir, variant) {
  const job = `resume-${variant}`;

  /* Twice, so hyperref's references settle, exactly as build.sh does. */
  let log = '';
  for (let pass = 0; pass < 2; pass += 1) {
    const { error, stdout } = await run(
      'pdflatex',
      [
        '-interaction=nonstopmode',
        '-halt-on-error',
        `-jobname=${job}`,
        `\\def\\variant{${variant}}\\input{resume.tex}`,
      ],
      dir,
    );
    log = stdout ?? '';
    if (error) {
      return { ok: false, error: `Compile failed.\n${errorExcerpt(log)}` };
    }
  }

  const pages = pageCount(log);
  if (pages !== 1) {
    return {
      ok: false,
      error: `The ${variant} resume came out as ${pages ?? 'an unknown number of'} pages. It has to be one.`,
      pages,
    };
  }

  const pdf = await readFile(join(dir, `${job}.pdf`));
  return { ok: true, pages, pdf: pdf.toString('base64') };
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return json(res, 200, { ok: true, variants: Object.keys(VARIANTS) });
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/compile')) {
    return json(res, 404, { error: 'Not found.' });
  }

  if (!authorized(req)) {
    return json(res, 401, { error: 'Bad or missing compile secret.' });
  }

  let raw = '';
  let tooBig = false;
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_TEX_BYTES) {
      tooBig = true;
      break;
    }
  }
  if (tooBig) return json(res, 413, { error: 'That source is too large.' });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Send JSON.' });
  }

  const tex = typeof body.tex === 'string' ? body.tex : '';
  if (!tex) return json(res, 400, { error: 'No source sent.' });

  const wanted = Array.isArray(body.variants)
    ? body.variants.filter((v) => v in VARIANTS)
    : Object.keys(VARIANTS);
  if (wanted.length === 0) return json(res, 400, { error: 'No known variant requested.' });

  const started = Date.now();
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), 'resume-'));
    await writeFile(join(dir, 'resume.tex'), tex, 'utf8');

    /* Sequential on purpose: the container has one CPU, and four ~250ms
       compiles in a row beat four fighting over it. */
    const pdfs = {};
    for (const variant of wanted) {
      const result = await compileVariant(dir, variant);
      if (!result.ok) {
        return json(res, 422, { error: result.error, variant, pages: result.pages ?? null });
      }
      pdfs[VARIANTS[variant]] = result.pdf;
    }

    return json(res, 200, { ok: true, pdfs, ms: Date.now() - started });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Compile failed.' });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

server.listen(PORT, () => {
  console.log(`resume compile service listening on ${PORT}`);
  if (!SECRET) console.warn('COMPILE_SECRET is unset: every request will be rejected.');
});
