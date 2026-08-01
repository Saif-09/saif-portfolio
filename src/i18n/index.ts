import en from './en.json';
import hi from './hi.json';
import kn from './kn.json';
import ur from './ur.json';
import te from './te.json';
import ar from './ar.json';
import hiLatn from './hi-latn.json';
import manifest from './machine/manifest.json';
import { DEFAULT_LOCALE, type Locale } from './locales';

/** The English catalog is the source of truth for shape and keys. */
export type Messages = typeof en;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const catalogs: Record<Locale, DeepPartial<Messages>> = {
  en,
  hi,
  kn,
  ur,
  te,
  ar,
  'hi-latn': hiLatn,
};

/**
 * Machine-translated catalogs (Phase 6, written by scripts/translate.mjs).
 * They only merge in once their manifest entry is flipped to "reviewed"
 * (D006 review gate) - until then the site keeps its English fallback.
 * Hand-authored catalog strings always win over machine ones.
 */
const machineCatalogs = import.meta.glob('./machine/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, DeepPartial<Messages>>;

type ManifestEntry = { status?: string };

function machineCatalogFor(locale: Locale): DeepPartial<Messages> | undefined {
  const entry = (manifest as Record<string, ManifestEntry>)[`catalog:${locale}`];
  if (entry?.status !== 'reviewed') return undefined;
  return machineCatalogs[`./machine/${locale}.json`];
}

function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const patchValue = patch[key];
    if (patchValue === undefined) continue;
    const baseValue = base[key];
    out[key] =
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue) &&
      !Array.isArray(patchValue)
        ? (deepMerge(
            baseValue as object,
            patchValue as DeepPartial<object>,
          ) as T[typeof key])
        : (patchValue as T[typeof key]);
  }
  return out;
}

/** Merged catalogs are immutable per build - memoize per locale so the
    deep merge runs once, not once per component per page render. */
const mergedCache = new Map<Locale, Messages>();

/** Messages for a locale, falling back to English key-by-key. */
export function useTranslations(locale: Locale): Messages {
  if (locale === DEFAULT_LOCALE) return en;
  const cached = mergedCache.get(locale);
  if (cached) return cached;
  let merged: Messages = en;
  const machine = machineCatalogFor(locale);
  if (machine) merged = deepMerge(merged, machine);
  merged = deepMerge(merged, catalogs[locale] ?? {});
  mergedCache.set(locale, merged);
  return merged;
}

export { LOCALES, DEFAULT_LOCALE, getLocale, pathForLocale, stripLocale } from './locales';
export type { Locale, LocaleDef, ScriptFont } from './locales';
