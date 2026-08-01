# saif-portfolio

Personal portfolio for **Mohd Saif — Product Engineer**. Minimal, editorial, type-led. Phase 1: full homepage (hero, proof strip, about, selected work, how-I-work, contact UI), MDX case studies at `/work/[slug]`, the `/brain` knowledge-graph content layer, and complete SEO (robots.txt with AI-crawler allowances, localized sitemap with hreflang + x-default, JSON-LD, OG image, llms.txt).

**Content language:** all body content is English only; the 6 non-English locales fall back to English automatically. Bulk translation is a deferred build-time script — do not hand-translate content. UI chrome strings translated in Phase 0 stay as they are.

**TODO(saif) markers:** real metrics go in `src/data/profile.ts` (proof-strip stats) and the `[TODO: …]` slots in `src/content/work/en/*.mdx`.

## Phase 3A — WebGL hero + graph canvas

- **Hero field**: `src/components/hero/HeroField.tsx` gates on reduced-motion / coarse pointer / narrow viewport / low power (`deviceMemory`/`hardwareConcurrency` ≤ 4) / WebGL availability, and only then dynamic-imports `HeroScene` (plain three via named imports, ~129KB gz — R3F was dropped because its dynamic THREE namespace defeats tree-shaking, measured 241KB gz). Degraded paths keep the pure-CSS Stone poster on `.hero-canvas` and download none of it. The render loop pauses off-screen and on hidden tabs (heartbeat exposed as `data-t` on the mount for testing).
- **Graph**: `/graph.json` is a build-time endpoint from the vault parser. `src/components/graph/` holds the canvas core + the `/brain` island (hover-highlight, tooltip, pan/zoom/drag, click→note, search filter) and the homepage mini-graph. Node size = degree, node tone = type (bg→ink mix, no hue). Reduced motion = static pre-computed layout.

## Phase 3B — "Ask this site"

Homepage section 05: a streamed AI answer grounded only in this repo's own content. `src/lib/ask/corpus.ts` inlines the brain vault, case studies, projects/profile data, and llms.txt into the function bundle at build time (raw imports — no runtime fs) and does keyword-overlap retrieval. `src/pages/api/ask.ts` (`prerender = false` → Vercel function) streams `anthropic/claude-haiku-4.5` through the Vercel AI Gateway with strict grounding guardrails, a 5/min per-IP sliding-window rate limit, 300-char questions, 400 max output tokens, ~7KB context cap.

**⚠️ To activate live answers**: the team needs a credit card on file for AI Gateway (unlocks free credits) — vercel.com → team → AI → "Add credit card". No key setup or redeploy needed after that (OIDC). Until then the widget shows its designed error state.

## Phase 4 — custom analytics

- **Tracker** (`src/components/track/TrackerRoot.tsx`, ~2.1KB gz): cookieless, DNT/GPC-honoring, starts after `load`. Pageviews, scroll milestones, per-section attention (IntersectionObserver), one delegated click listener (stable selector + normalized x/y for the click map), named events (`demo_used`, `cta_click`, `lang_change`, `theme_change`, `work_card_click`, `graph_node_click`, `contact` — components emit via `src/lib/track/emit.ts`). Batched via `sendBeacon` every 8s + on hide. Session = random UUID in sessionStorage, 30-min rotation.
- **APIs**: `/api/track` (validate → bot-filter → rate-limit → country from `x-vercel-ip-country`, IP never stored → batch INSERT), `/api/insights` (SQL aggregates, 60s KV cache), `/api/live` (KV only).
- **Storage is env-driven** (`src/lib/analytics/db.ts`, `kv.ts`): `POSTGRES_URL` (local Postgres in dev → **Neon** in prod) and `REDIS_URL` (local Redis in dev → **Upstash** in prod). Unset → writes drop, reads return empty payloads: the preview shows the designed empty state. **To go live: set the two env vars in Vercel. Nothing else.** Schema auto-creates on first write.
- **Dashboard**: `/analytics` (public), all charts hand-rolled in Stone with a `<details>` data-table alternative each; teaser section `#measured` on the homepage. Local E2E verified: visitor journey → Postgres rows → aggregates → dashboard.

## Phase 5 — contact backend + audit

- `/api/contact`: validation, honeypot (`company` field), 5/min/IP rate limit, spam heuristics (silently dropped), Resend send with `reply_to` = submitter. **Env-driven**: no `RESEND_API_KEY` → simulated success (nothing breaks). At launch set `RESEND_API_KEY` (+ optionally `CONTACT_FROM` after domain verification; defaults to Resend's test sender, `CONTACT_TO` defaults to saifmd238@gmail.com).
- Per-locale OG images in `public/og/` (`home-{locale}.png`, `work-{slug}.png`) — regenerate with `node scripts/generate-og.mjs`.
- Pinned featured-card a11y: keyboard focus into either card scrubs the pin to reveal it (see MotionRoot).

## Phase 6 — translation tooling

`npm run translate -- [--dry-run] [--only=<locale>] [--sample] [--brain] [--mock]` (note the `--` — npm eats flags otherwise). Translates the English source of truth into hi/kn/te/ur/ar/hi-Latn via the AI Gateway (Sonnet-class model): missing UI-catalog keys (Phase 0 hand translations are never touched), case-study MDX → `src/content/work/<locale>/`, and (with `--brain`) note bodies → `src/i18n/machine/brain/`. Incremental: `src/i18n/machine/manifest.json` hashes every English source, so re-runs only translate what changed. Everything ships `translationStatus: machine` and stays on English fallback until flipped to `reviewed` (in the manifest for catalogs/brain, in MDX frontmatter for case studies) — the D006 review gate. Without an `AI_GATEWAY_API_KEY` it exits cleanly; the full run happens at launch (D017).

## /brain

`src/lib/brain.ts` parses the Obsidian vault at `./brain` at build time (gray-matter + remark): wikilinks `[[Note]]` / `[[Note|alias]]` resolve to `/brain/[slug]` (ignored inside code spans/blocks), backlinks are collected, and each note renders as a crawlable page. `/brain` groups notes by frontmatter `type`. The interactive force-graph mounts at `#brain-graph-mount` in Phase 3; the WebGL hero mounts at `#hero-webgl-mount`.

## Stack

- [Astro 5](https://astro.build) with React 19 islands (`@astrojs/react`), TypeScript
- Tailwind CSS 4 on top of CSS custom-property design tokens (`src/styles/tokens.css`)
- Deployed to Vercel via `@astrojs/vercel` (static output) + `@vercel/speed-insights`

## Run

```sh
npm install
npm run dev       # dev server at http://localhost:4321
npm run build     # static build → dist/ and .vercel/output/
npx serve dist    # preview the production build locally
```

## Deploy

```sh
npx vercel        # preview deploy
npx vercel --prod # production
```

Any push to a connected Git repo also deploys automatically once the project is linked on Vercel.

**TODO when the real domain is decided:** update `SITE` in `astro.config.mjs` (drives canonical + hreflang URLs), and replace the placeholder footer links in `src/components/Footer.astro`.

## Structure

```
src/
  layouts/Base.astro        # head (SEO, hreflang, preloads), theme no-flash script, landmarks
  components/
    Header.astro            # site name + language switcher + theme toggle
    Footer.astro            # placeholder links
    Hero.astro              # centered placeholder hero
    ThemeToggle.tsx         # React island (~1 kB)
    LanguageSwitcher.tsx    # React island (~1.3 kB)
  i18n/
    locales.ts              # locale registry: code, lang, dir, native name, script font
    index.ts                # typed catalogs, deep fallback to English
    en.json … hi-latn.json  # string catalogs (en is the source of truth)
  styles/
    tokens.css              # "Stone" design tokens, both themes
    global.css              # Tailwind, fonts, base styles, header-control styles
  pages/
    index.astro             # / (English, default locale)
    [locale]/index.astro    # /hi/ /kn/ /ur/ /te/ /ar/ /hi-latn/
public/fonts/               # self-hosted variable woff2 (General Sans, Inter, Noto per script)
```

## Theming

Tokens are hueless ("Stone") and defined per theme in `tokens.css`. The active theme lives on `<html data-theme="light|dark">`, set **before first paint** by an inline script in `Base.astro` (localStorage → `prefers-color-scheme` fallback), so there is no flash. The toggle persists to `localStorage.theme`. No-JS visitors get the OS preference via a `prefers-color-scheme` fallback block.

## i18n

Seven locales; English is the default and has no URL prefix. `<html lang>` and `dir` (RTL for `ur`, `ar`) are set per route. Catalogs are typed against the English JSON; missing keys fall back key-by-key. Layout uses CSS logical properties throughout, so RTL mirrors automatically.

**Per-locale fonts:** every page loads General Sans + Inter (Latin). A script font (Noto Sans Devanagari / Kannada / Telugu / Arabic, Noto Nastaliq Urdu) is declared and preloaded **only** on the locale that needs it — English/Hinglish visitors never download a Noto font. Font files come from Fontsource (Noto, Inter) and Fontshare (General Sans); to update, bump the `@fontsource-variable/*` devDependencies and re-copy the woff2 files into `public/fonts/`.
