// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// TODO: replace with the final production domain once decided.
const SITE = 'https://saifsiddiqui.in';

export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({
    // /api/ask streams model output; give it headroom beyond the default.
    maxDuration: 60,
  }),
  integrations: [
    react(),
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          hi: 'hi',
          kn: 'kn',
          ur: 'ur',
          te: 'te',
          ar: 'ar',
          'hi-latn': 'hi-Latn',
        },
      },
      serialize(item) {
        // @astrojs/sitemap emits per-locale alternates; add x-default → en.
        const links = item.links;
        if (links?.length) {
          const en = links.find((l) => l.lang === 'en');
          if (en && !links.some((l) => l.lang === 'x-default')) {
            links.push({ lang: 'x-default', url: en.url });
          }
        }
        return item;
      },
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: [
      'en',
      'hi',
      'kn',
      'ur',
      'te',
      'ar',
      { path: 'hi-latn', codes: ['hi-Latn'] },
    ],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
