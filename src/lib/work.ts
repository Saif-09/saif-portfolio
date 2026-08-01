import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../i18n';

export type WorkEntry = CollectionEntry<'work'>;

/** Slugs of all English (canonical) case studies. */
export async function getWorkSlugs(): Promise<string[]> {
  const entries = await getCollection('work', (e) => e.id.startsWith('en/'));
  return entries
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => e.id.slice('en/'.length));
}

/**
 * Entry for a locale, falling back to English when no translation exists -
 * or when one exists but hasn't passed the D006 review gate yet.
 */
export async function getWorkEntry(
  locale: Locale,
  slug: string,
): Promise<WorkEntry | undefined> {
  if (locale !== DEFAULT_LOCALE) {
    const localized = await getEntry('work', `${locale}/${slug}`);
    if (localized && localized.data.translationStatus === 'reviewed') return localized;
  }
  return getEntry('work', `${DEFAULT_LOCALE}/${slug}`);
}
