import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ciPattern,
  pagePathsPattern,
  negotiationRoutes,
  patchVercelConfig,
  NEGOTIATION_ENDPOINT,
} from '../scripts/lib/negotiation-routes.mjs';

const PAGES = ['/', '/about', '/work', '/work/ueue', '/brain/d009-seo-and-ai-crawlers'];

function config(routes) {
  return { version: 3, routes };
}

const BASE = [
  { src: '^/cv$', headers: { Location: '/x.pdf' }, status: 302 },
  { handle: 'filesystem' },
  { src: '^/api/markdown/?$', dest: '_render' },
  { src: '/.*', dest: '_render', status: 404 },
];

test('the page pattern matches pages with and without a trailing slash', () => {
  const re = new RegExp(pagePathsPattern(PAGES));
  for (const path of ['/', '/about', '/about/', '/work', '/work/', '/work/ueue', '/work/ueue/']) {
    assert.ok(re.test(path), `expected ${path} to match`);
  }
});

test('the page pattern does not match anything else', () => {
  const re = new RegExp(pagePathsPattern(PAGES));
  for (const path of [
    '/work/not-a-project',
    '/about/deeper',
    '/_astro/app.css',
    '/favicon.svg',
    '/llms.txt',
    '/hi/about',
    '/api/ask',
    '/resume',
  ]) {
    assert.ok(!re.test(path), `expected ${path} not to match`);
  }
});

test('the page pattern captures the path for the rewrite', () => {
  const re = new RegExp(pagePathsPattern(PAGES));
  assert.equal('/work/ueue/'.match(re)[1], 'work/ueue');
  assert.equal('/about'.match(re)[1], 'about');
  // The home page captures an empty string, so `p=/$1` stays `p=/`.
  assert.equal('/'.match(re)[1], '');
});

test('a longer page cannot be swallowed by a shorter prefix', () => {
  const re = new RegExp(pagePathsPattern(['/work', '/work/ueue']));
  assert.equal('/work/ueue'.match(re)[1], 'work/ueue');
});

test('case-insensitive patterns cover both spellings, JS RegExp having no (?i)', () => {
  const re = new RegExp(ciPattern('text/markdown'));
  assert.ok(re.test('text/markdown'));
  assert.ok(re.test('TEXT/MARKDOWN'));
  assert.ok(!re.test('text-markdown'));
});

test('the markdown rule fires on Accept headers that name markdown', () => {
  const [, markdown] = negotiationRoutes(PAGES);
  const re = new RegExp(markdown.has[0].value);
  assert.ok(re.test('text/markdown'));
  assert.ok(re.test('text/markdown, text/html;q=0.9, */*;q=0.8'));
  assert.ok(re.test('text/html;q=0.9, text/markdown;q=0.8'));
  assert.ok(
    !re.test('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
    'a browser must never be routed through the function',
  );
  assert.ok(!re.test('*/*'));
});

test('the 406 rule fires only when nothing we produce is acceptable', () => {
  const [, , unsatisfiable] = negotiationRoutes(PAGES);
  const satisfiable = new RegExp(unsatisfiable.missing[0].value);
  // `missing` matches when the header does NOT match, so these must match
  // (and therefore not trigger the rule).
  for (const accept of [
    '*/*',
    'text/html',
    'text/*',
    'text/markdown',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8',
  ]) {
    assert.ok(satisfiable.test(accept), `${accept} should be servable`);
  }
  for (const accept of ['application/pdf', 'image/png, image/webp', 'application/json']) {
    assert.ok(!satisfiable.test(accept), `${accept} should earn a 406`);
  }
});

test('the rewrite target carries the original path to the endpoint', () => {
  const [, markdown, unsatisfiable] = negotiationRoutes(PAGES);
  assert.equal(markdown.dest, `${NEGOTIATION_ENDPOINT}?p=/$1`);
  assert.equal(unsatisfiable.dest, `${NEGOTIATION_ENDPOINT}?p=/$1`);
});

test('Vary: Accept is added without swallowing the request', () => {
  const [vary] = negotiationRoutes(PAGES);
  assert.equal(vary.continue, true);
  assert.equal(vary.headers.vary, 'Accept');
  assert.equal(vary.dest, undefined);
});

test('routes land before the filesystem phase, where they can still see the request', () => {
  const patched = patchVercelConfig(config(BASE), PAGES);
  const filesystem = patched.routes.findIndex((r) => r.handle === 'filesystem');
  const inserted = patched.routes.slice(0, filesystem);
  assert.equal(inserted.length, 4, 'the redirect plus three negotiation rules');
  assert.equal(inserted[0].src, '^/cv$', 'existing redirects keep their priority');
  assert.equal(inserted[3].dest, `${NEGOTIATION_ENDPOINT}?p=/$1`);
  // The adapter's own routes are untouched.
  assert.deepEqual(patched.routes.slice(filesystem), BASE.slice(1));
});

test('patching twice is the same as patching once', () => {
  const once = patchVercelConfig(config(BASE), PAGES);
  const twice = patchVercelConfig(once, PAGES);
  assert.deepEqual(twice, once);
});

test('a config that is not what this build produces fails the build', () => {
  assert.throws(() => patchVercelConfig(config([{ src: '/x' }]), PAGES), /filesystem/);
  assert.throws(() => patchVercelConfig({ version: 3 }, PAGES), /routes array/);
  assert.throws(() => patchVercelConfig(config(BASE), []), /nothing to negotiate/);
});
