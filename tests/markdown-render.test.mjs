import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFrontmatter,
  wikilinksToMarkdown,
  mdPathForPage,
  pagePathForMd,
  mdParamForPage,
  link,
  joinBlocks,
} from '../src/lib/markdown/render.mjs';

test('frontmatter reads scalars, inline lists, and block lists', () => {
  const { data, body } = readFrontmatter(
    [
      '---',
      "title: 'Vouch: a tool that grades me'",
      'role: built-0-1',
      'tags: [decision, seo, ai]',
      'stack:',
      '  - React Native',
      '  - Next.js',
      'order: 3.8',
      '---',
      '',
      '## Problem',
    ].join('\n'),
  );
  assert.equal(data.title, 'Vouch: a tool that grades me');
  assert.equal(data.role, 'built-0-1');
  assert.deepEqual(data.tags, ['decision', 'seo', 'ai']);
  assert.deepEqual(data.stack, ['React Native', 'Next.js']);
  assert.equal(data.order, '3.8');
  assert.equal(body.trim(), '## Problem');
});

test('a document without frontmatter is returned whole', () => {
  const { data, body } = readFrontmatter('# Just a heading\n');
  assert.deepEqual(data, {});
  assert.equal(body, '# Just a heading\n');
});

test('wikilinks become real links, aliases included', () => {
  const slugs = new Map([
    ['knowledge graph', 'knowledge-graph'],
    ['d002 - tech stack', 'd002-tech-stack'],
  ]);
  assert.equal(
    wikilinksToMarkdown('See [[Knowledge Graph]] and [[D002 - Tech Stack|Astro]].', slugs),
    'See [Knowledge Graph](/brain/knowledge-graph/) and [Astro](/brain/d002-tech-stack/).',
  );
});

test('an unresolved wikilink degrades to text, never a dead link', () => {
  assert.equal(wikilinksToMarkdown('See [[Nothing Here]].', new Map()), 'See Nothing Here.');
});

test('page paths map to .md twins and back', () => {
  assert.equal(mdPathForPage('/'), '/index.md');
  assert.equal(mdPathForPage('/about/'), '/about.md');
  assert.equal(mdPathForPage('/work/ueue/'), '/work/ueue.md');
  assert.equal(pagePathForMd('/index.md'), '/');
  assert.equal(pagePathForMd('/work/ueue.md'), '/work/ueue');
  assert.equal(mdParamForPage('/'), 'index');
  assert.equal(mdParamForPage('/work/ueue/'), 'work/ueue');
});

test('the round trip through a .md twin is lossless', () => {
  for (const page of ['/', '/about/', '/work/', '/brain/d009-seo-and-ai-crawlers/']) {
    assert.equal(`${pagePathForMd(mdPathForPage(page))}/`.replace('//', '/'), page);
  }
});

test('link labels with brackets survive', () => {
  assert.equal(link('D009 [draft]', '/brain/d009/'), '[D009 \\[draft\\]](/brain/d009/)');
});

test('joinBlocks drops empties and never leaves a triple newline', () => {
  const out = joinBlocks(['# Title', null, '', 'Body\n\n\n\nMore', undefined]);
  assert.equal(out, '# Title\n\nBody\n\nMore\n');
});
