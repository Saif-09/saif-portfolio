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
  /**
   * The resume lives at a memorable path on this domain, never a Drive link:
   * /resume (and /cv) redirect to the PDF in public/. The PDF is named
   * Mohd_Saif_Resume.pdf so it lands in a recruiter's downloads folder under
   * that name rather than as resume.pdf.
   *
   * These MUST live here, not in vercel.json: @astrojs/vercel writes its own
   * .vercel/output/config.json via the Build Output API, which supersedes
   * vercel.json redirects/rewrites. The adapter translates this map into real
   * 302s at the routing layer (no meta-refresh HTML hop). 302 and not Astro's
   * default 301: a permanent redirect is cached hard by browsers, so
   * retargeting /resume later would never reach anyone who already clicked it.
   * /resume/ (trailing slash) is covered by public/resume/index.html.
   */
  redirects: {
    '/resume': { status: 302, destination: '/Mohd_Saif_Resume.pdf' },
    '/resume.pdf': { status: 302, destination: '/Mohd_Saif_Resume.pdf' },
    '/cv': { status: 302, destination: '/Mohd_Saif_Resume.pdf' },
  },
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
