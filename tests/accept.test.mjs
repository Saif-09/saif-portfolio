import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccept,
  selectRepresentation,
  prefersMarkdown,
  varyAccept,
  notAcceptableBody,
} from '../src/lib/http/accept.mjs';

test('a missing or empty Accept header means no constraint, not 406', () => {
  assert.equal(selectRepresentation(null), 'text/html');
  assert.equal(selectRepresentation(undefined), 'text/html');
  assert.equal(selectRepresentation(''), 'text/html');
  assert.equal(selectRepresentation('   '), 'text/html');
});

test('*/* takes the default representation', () => {
  assert.equal(selectRepresentation('*/*'), 'text/html');
  assert.equal(selectRepresentation('text/*'), 'text/html');
});

test('an agent asking for markdown gets markdown', () => {
  assert.equal(selectRepresentation('text/markdown'), 'text/markdown');
  assert.equal(
    selectRepresentation('text/markdown, text/html;q=0.9, */*;q=0.8'),
    'text/markdown',
  );
  assert.ok(prefersMarkdown('text/markdown;charset=utf-8'));
});

test('q-values decide, not the order the types happen to appear in', () => {
  assert.equal(selectRepresentation('text/html;q=0.9, text/markdown;q=0.8'), 'text/html');
  assert.equal(selectRepresentation('text/html;q=0.8, text/markdown;q=0.9'), 'text/markdown');
  assert.equal(selectRepresentation('text/markdown;q=0.1, text/html'), 'text/html');
});

test('equal q falls back to the order the client sent', () => {
  assert.equal(selectRepresentation('text/markdown, text/html'), 'text/markdown');
  assert.equal(selectRepresentation('text/html, text/markdown'), 'text/html');
});

test('q=0 is an explicit rejection, even against a wildcard', () => {
  assert.equal(selectRepresentation('text/markdown;q=0, */*'), 'text/html');
  assert.equal(selectRepresentation('text/html;q=0, text/markdown'), 'text/markdown');
  assert.equal(selectRepresentation('text/html;q=0, */*'), 'text/markdown');
  assert.equal(selectRepresentation('*/*;q=0'), null);
});

test('a specific range beats a wildcard regardless of q', () => {
  // text/html is pinned to 0.1 by the specific range; markdown only has the
  // wildcard, so markdown wins on 1.0.
  assert.equal(selectRepresentation('text/html;q=0.1, */*'), 'text/markdown');
});

test('only a genuinely unsatisfiable Accept returns null (a 406)', () => {
  assert.equal(selectRepresentation('application/pdf'), null);
  assert.equal(selectRepresentation('image/png, image/webp'), null);
  assert.equal(selectRepresentation('application/json;q=0.9'), null);
});

test('a browser Accept header still gets HTML', () => {
  assert.equal(
    selectRepresentation(
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    ),
    'text/html',
  );
});

test('garbage ranges are skipped rather than crashing the parse', () => {
  assert.deepEqual(
    parseAccept('nonsense, text/markdown;q=0.5').map((e) => e.type),
    ['text/markdown'],
  );
  assert.equal(selectRepresentation('nonsense,,, text/markdown'), 'text/markdown');
});

test('media types are matched case-insensitively', () => {
  assert.equal(selectRepresentation('TEXT/MARKDOWN'), 'text/markdown');
});

test('Vary keeps whatever was already there', () => {
  assert.equal(varyAccept(null), 'Accept');
  assert.equal(varyAccept(''), 'Accept');
  assert.equal(varyAccept('Accept-Encoding'), 'Accept-Encoding, Accept');
  assert.equal(varyAccept('Accept-Encoding, Accept'), 'Accept-Encoding, Accept');
  assert.equal(varyAccept('accept'), 'accept');
});

test('the 406 body lists what the resource can produce', () => {
  const body = notAcceptableBody('application/pdf');
  assert.match(body, /text\/html/);
  assert.match(body, /text\/markdown/);
  assert.match(body, /You requested: application\/pdf/);
  assert.match(notAcceptableBody(''), /\(no Accept header\)/);
});
