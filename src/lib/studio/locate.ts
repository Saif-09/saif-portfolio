/**
 * Clicking a word in the rendered PDF and landing on it in the LaTeX.
 *
 * SyncTeX is the textbook answer and it is the wrong one here. It would mean
 * changing the compile service to emit and return a .synctex.gz, shipping a
 * parser for a bespoke compressed format, and accepting line granularity,
 * because pdflatex's column field is mostly -1. What is actually wanted is
 * narrower: this document is words, so match the words.
 *
 * So: flatten the source down to the text a reader would see, keeping a map
 * from every flattened character back to the byte it came from, then look up
 * the phrase the click landed on. That gives word-level precision rather than
 * line-level, needs nothing from the backend, and keeps working on a draft the
 * compiler has not seen yet.
 *
 * Where it gives up, it says so rather than guessing: an unmatched click leaves
 * the cursor where it was, which is better than moving it somewhere wrong.
 */

export interface Flattened {
  /** Visible text, runs of whitespace collapsed to one space. */
  text: string;
  /** map[i] is the source offset that text[i] came from. */
  map: number[];
}

/**
 * Commands whose arguments are machinery rather than words on the page, and
 * how many arguments to throw away. Anything not listed keeps its arguments,
 * which is what makes \resumeSubheading{Shoppin'}{...} findable without
 * teaching this file about \resumeSubheading.
 */
const DROP_ARGS: Record<string, number> = {
  documentclass: 1,
  usepackage: 1,
  RequirePackage: 1,
  input: 1,
  include: 1,
  vspace: 1,
  hspace: 1,
  setlength: 2,
  addtolength: 2,
  hypersetup: 1,
  geometry: 1,
  pagestyle: 1,
  thispagestyle: 1,
  urlstyle: 1,
  label: 1,
  ref: 1,
  pageref: 1,
  titleformat: 6,
  titlespacing: 4,
  definecolor: 3,
  color: 1,
  fontfamily: 1,
  faIcon: 1,
  includegraphics: 1,
  /* The first argument names the macro; the body after it is real text. */
  newcommand: 1,
  renewcommand: 1,
  providecommand: 1,
  /* \ifdefstring{\variant}{mobile}{...}: the third argument is the content. */
  ifdefstring: 2,
  ifdefempty: 1,
  raisebox: 1,
};

/** Commands where the visible text is the second argument. */
const SECOND_ARG = new Set(['href', 'textcolor', 'colorbox', 'fcolorbox']);

/**
 * Pure formatting wrappers. These must NOT introduce a space, or `2.5s` in
 * `from \textbf{2.5s} to` would flatten with a gap the PDF does not have.
 */
const TRANSPARENT = new Set([
  'textbf',
  'textit',
  'emph',
  'texttt',
  'textsc',
  'textrm',
  'textsf',
  'underline',
  'uline',
  'mbox',
  'text',
  'bf',
  'it',
  'rm',
  'sc',
]);

/** Index just past the delimiter matching the one at `at`, or -1. */
function matchDelim(source: string, at: number, open: string, close: string): number {
  if (source[at] !== open) return -1;
  let depth = 0;
  for (let i = at; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '%') {
      const nl = source.indexOf('\n', i);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function flattenTex(source: string): Flattened {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  const space = () => {
    if (chars.length) pendingSpace = true;
  };
  const push = (char: string, at: number) => {
    if (pendingSpace) {
      chars.push(' ');
      map.push(at);
      pendingSpace = false;
    }
    chars.push(char);
    map.push(at);
  };

  /** Optional [...] arguments are machinery too, and always follow a command. */
  const skipOptional = (from: number): number => {
    let i = from;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    while (source[i] === '[') {
      const close = matchDelim(source, i, '[', ']');
      if (close === -1) return i;
      i = close + 1;
      while (i < source.length && /\s/.test(source[i])) i += 1;
    }
    return i;
  };

  const skipGroups = (from: number, count: number): number => {
    let i = skipOptional(from);
    for (let n = 0; n < count; n += 1) {
      if (source[i] !== '{') break;
      const close = matchDelim(source, i, '{', '}');
      if (close === -1) break;
      i = skipOptional(close + 1);
    }
    return i;
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];

    /* A comment runs to end of line. An escaped %% never reaches here. */
    if (char === '%') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      space();
      continue;
    }

    if (char === '\\') {
      const word = /^[A-Za-z]+\*?/.exec(source.slice(i + 1))?.[0];

      if (!word) {
        const next = source[i + 1];
        if (next === '\\') {
          space();
          i += 2;
          continue;
        }
        /* An underscore comes back out of the PDF as a space, because the
           typewriter font's glyph does not map to one. \texttt{device\_id}
           is extracted as "device id", so both sides agree on a space. */
        if (next === '_') {
          push(' ', i + 1);
          i += 2;
          continue;
        }
        /* \& \% \# \$ \{ \} are the character itself. */
        if (next !== undefined && '&%#${}'.includes(next)) {
          push(next, i + 1);
          i += 2;
          continue;
        }
        /* \, and \; are visible gaps; \! is a negative one. */
        if (next !== undefined && ',;: '.includes(next)) {
          space();
          i += 2;
          continue;
        }
        i += 2;
        continue;
      }

      let j = i + 1 + word.length;

      if (word === 'begin' || word === 'end') {
        const at = skipOptional(j);
        let env = '';
        if (source[at] === '{') {
          const close = matchDelim(source, at, '{', '}');
          if (close !== -1) env = source.slice(at + 1, close);
        }
        j = skipGroups(j, 1);
        /* tabular takes a column spec, tabular* a width as well, and neither
           of those is text. */
        if (word === 'begin') {
          if (env === 'tabular*' || env === 'tabularx') j = skipGroups(j, 2);
          else if (env === 'tabular') j = skipGroups(j, 1);
        }
        space();
        i = j;
        continue;
      }

      if (word in DROP_ARGS) {
        i = skipGroups(j, DROP_ARGS[word]);
        space();
        continue;
      }

      if (SECOND_ARG.has(word)) {
        i = skipGroups(j, 1);
        continue;
      }

      if (!TRANSPARENT.has(word)) space();
      i = j;
      continue;
    }

    /* Braces are structure. Their contents already flow through, and a math
       delimiter is not on the page even though what it wraps is: $|$ renders
       as a bare rule between two dates. */
    if (char === '{' || char === '}' || char === '$') {
      i += 1;
      continue;
    }

    /* An en or em dash is one character on the page. Mapping it to the first
       hyphen keeps the map one-to-one with what a reader sees. */
    if (char === '-' && source[i + 1] === '-') {
      push('-', i);
      i += source[i + 2] === '-' ? 3 : 2;
      continue;
    }

    if (char === '&' || char === '~') {
      space();
      i += 1;
      continue;
    }

    if (/\s/.test(char)) {
      space();
      i += 1;
      continue;
    }

    push(char, i);
    i += 1;
  }

  return { text: chars.join(''), map };
}

/**
 * Typographic characters the compiler introduces, folded back to what the
 * source actually contains. Applied to the phrase read out of the PDF, never
 * to the flattened source, whose offsets have to keep lining up.
 */
export function foldTypography(input: string): string {
  return input
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Located {
  /** Range in the ORIGINAL source. */
  start: number;
  end: number;
  /** How many places this text appears. More than one means it was a guess. */
  matches: number;
  /**
   * True when only part of the clicked text exists in the source, because the
   * compiler assembled the line out of pieces: `{SDE-I, \roleTitle}` prints as
   * one phrase that is never one phrase in the file.
   */
  partial: boolean;
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  if (!needle) return found;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = haystack.indexOf(needle, at + 1);
  }
  return found;
}

/** Longest context first: the phrase alone is the last resort, not the first. */
function anchorsFor(target: string, before: string, after: string): [string, number][] {
  const list: [string, number][] = [];
  if (before && after) list.push([`${before} ${target} ${after}`, before.length + 1]);
  if (after) list.push([`${target} ${after}`, 0]);
  if (before) list.push([`${before} ${target}`, before.length + 1]);
  list.push([target, 0]);
  return list;
}

interface Hit {
  at: number;
  matches: number;
}

/**
 * Case matters more than context: a click on "GitHub" must land on the link
 * text and not on the lowercase github.com next to it. So every anchor is
 * tried exactly before any of them is tried case-insensitively.
 */
function search(
  flat: Flattened,
  anchors: [string, number][],
  prefer?: [number, number],
): Hit | null {
  for (const fold of [false, true]) {
    const haystack = fold ? flat.text.toLowerCase() : flat.text;
    for (const [anchor, offset] of anchors) {
      const hits = occurrences(haystack, fold ? anchor.toLowerCase() : anchor);
      if (!hits.length) continue;
      const inside = prefer
        ? hits.filter((at) => {
            const source = flat.map[at + offset];
            return source >= prefer[0] && source <= prefer[1];
          })
        : [];
      return { at: (inside.length ? inside : hits)[0] + offset, matches: hits.length };
    }
  }
  return null;
}

/** Below this a partial match is not worth making the cursor jump for. */
const MIN_PARTIAL = 10;

/**
 * Find the text a click landed on.
 *
 * `before` and `after` are the neighbouring runs from the same page, and they
 * are what makes this reliable: "Shoppin'" alone appears in four variant
 * blocks, "Shoppin' ... Bengaluru" appears once.
 *
 * When the whole phrase is not in the file, the longest run of it that is
 * wins, from the front first and then from the back. That covers the case the
 * naive version gets wrong: a printed line that the compiler built out of a
 * literal and a macro exists on the page and nowhere in the source, and the
 * useful answer is still the piece of it you can actually edit.
 *
 * `prefer` narrows to a region, so a click on the summary of the variant on
 * screen resolves inside that variant's block rather than the base.
 */
export function locateInTex(
  flat: Flattened,
  phrase: string,
  context: { before?: string; after?: string; prefer?: [number, number] } = {},
): Located | null {
  const target = foldTypography(phrase);
  if (target.replace(/[^A-Za-z0-9]/g, '').length < 2) return null;

  const before = foldTypography(context.before ?? '');
  const after = foldTypography(context.after ?? '');
  const { prefer } = context;

  const finish = (hit: Hit, length: number, partial: boolean): Located | null => {
    const last = hit.at + length - 1;
    if (flat.map[hit.at] === undefined || flat.map[last] === undefined) return null;
    return {
      start: flat.map[hit.at],
      end: flat.map[last] + 1,
      matches: hit.matches,
      partial,
    };
  };

  const whole = search(flat, anchorsFor(target, before, after), prefer);
  if (whole) return finish(whole, target.length, false);

  const words = target.split(' ');
  if (words.length < 2) return null;

  /* Longest surviving prefix, then longest surviving suffix. A prefix still
     abuts `before`, a suffix still abuts `after`, and neither abuts both. */
  for (let n = words.length - 1; n >= 1; n -= 1) {
    const candidate = words.slice(0, n).join(' ');
    if (candidate.length < MIN_PARTIAL) break;
    const hit = search(flat, anchorsFor(candidate, before, ''), prefer);
    if (hit) return finish(hit, candidate.length, true);
  }

  for (let n = 1; n < words.length; n += 1) {
    const candidate = words.slice(n).join(' ');
    if (candidate.length < MIN_PARTIAL) break;
    const hit = search(flat, anchorsFor(candidate, '', after), prefer);
    if (hit) return finish(hit, candidate.length, true);
  }

  return null;
}

/**
 * The span of one variant's \ifdefstring block, used to break ties in favour
 * of the variant actually on screen.
 */
export function variantBlockRange(source: string, variant: string): [number, number] | undefined {
  const start = source.indexOf(`\\ifdefstring{\\variant}{${variant}}`);
  if (start === -1) return undefined;
  const next = source.indexOf('\\ifdefstring{\\variant}', start + 10);
  const end = next === -1 ? source.length : next;
  return [start, end];
}
