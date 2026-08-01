export interface ScriptFont {
  /** CSS font-family name registered by the per-locale @font-face. */
  family: string;
  /** Path under /public. */
  file: string;
}

export interface LocaleDef {
  /** URL path segment; also the key used in Astro's i18n config. */
  code: string;
  /** BCP-47 tag for <html lang>. */
  lang: string;
  dir: 'ltr' | 'rtl';
  /** Endonym, shown in the language switcher. */
  nativeName: string;
  /** Extra script font this locale needs; Latin locales need none. */
  scriptFont?: ScriptFont;
}

export const DEFAULT_LOCALE = 'en';

export const LOCALES: readonly LocaleDef[] = [
  { code: 'en', lang: 'en', dir: 'ltr', nativeName: 'English' },
  {
    code: 'hi',
    lang: 'hi',
    dir: 'ltr',
    nativeName: 'हिन्दी',
    scriptFont: {
      family: 'Noto Sans Devanagari',
      file: '/fonts/noto-sans-devanagari-devanagari-wght-normal.woff2',
    },
  },
  {
    code: 'kn',
    lang: 'kn',
    dir: 'ltr',
    nativeName: 'ಕನ್ನಡ',
    scriptFont: {
      family: 'Noto Sans Kannada',
      file: '/fonts/noto-sans-kannada-kannada-wght-normal.woff2',
    },
  },
  {
    code: 'ur',
    lang: 'ur',
    dir: 'rtl',
    nativeName: 'اردو',
    scriptFont: {
      family: 'Noto Nastaliq Urdu',
      file: '/fonts/noto-nastaliq-urdu-arabic-wght-normal.woff2',
    },
  },
  {
    code: 'te',
    lang: 'te',
    dir: 'ltr',
    nativeName: 'తెలుగు',
    scriptFont: {
      family: 'Noto Sans Telugu',
      file: '/fonts/noto-sans-telugu-telugu-wght-normal.woff2',
    },
  },
  {
    code: 'ar',
    lang: 'ar',
    dir: 'rtl',
    nativeName: 'العربية',
    scriptFont: {
      family: 'Noto Sans Arabic',
      file: '/fonts/noto-sans-arabic-arabic-wght-normal.woff2',
    },
  },
  { code: 'hi-latn', lang: 'hi-Latn', dir: 'ltr', nativeName: 'Hinglish' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export function getLocale(code: string): LocaleDef {
  const found = LOCALES.find((l) => l.code === code);
  if (!found) throw new Error(`Unknown locale: ${code}`);
  return found;
}

/** Strip a leading locale segment: "/hi/foo" → "/foo", "/foo" → "/foo". */
export function stripLocale(pathname: string): string {
  for (const l of LOCALES) {
    if (l.code === DEFAULT_LOCALE) continue;
    if (pathname === `/${l.code}` || pathname === `/${l.code}/`) return '/';
    if (pathname.startsWith(`/${l.code}/`)) {
      return pathname.slice(l.code.length + 1);
    }
  }
  return pathname;
}

/** Build the equivalent path in another locale, preserving the page. */
export function pathForLocale(code: string, currentPathname: string): string {
  const base = stripLocale(currentPathname);
  if (code === DEFAULT_LOCALE) return base;
  return base === '/' ? `/${code}/` : `/${code}${base}`;
}
