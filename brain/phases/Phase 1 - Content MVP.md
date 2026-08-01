---
title: Phase 1 - Content MVP
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log]
related: ["[[Roadmap]]", "[[Projects]]", "[[D004 - Case Study Framework]]", "[[D009 - SEO and AI Crawlers]]", "[[Knowledge Graph]]", "[[D015 - Defer Content Translation]]"]
---

# ✅ Phase 1: Content MVP (built & deployed)

Static, responsive, SEO-complete site + `/brain` content layer. No motion yet. Built with Fable. 238 pages, deployed to Vercel preview.

**Part A, content + work + contact + SEO:**
- All 7 homepage sections: hero (empty `#hero-webgl-mount` for Phase 3), proof strip (stat TODOs in `src/data/profile.ts`), about, two-track Selected Work (featured → case studies, grid → external, each labeled 0→1 / Contributed), How I Work (4 principles + tech list), contact (React island: per-field validation, aria-live, loading/success, **stubbed submit**), footer (real links + résumé + theme/locale + back-to-top).
- 4 MDX case studies: `/work/shoppin`, `/wellbeing-nutrition`, `/ueue`, `/prism`, Problem→Decision→Outcome with `[TODO: metric]` slots. Collection keyed `en/<slug>`; `getWorkEntry()` falls back to English (ready for [[D015 - Defer Content Translation|later locales]]).
- SEO ([[D009 - SEO and AI Crawlers]]): robots.txt allows all 16 named AI crawlers + default; sitemap with hreflang + **x-default via serialize hook** (Astro sitemap doesn't emit it alone), covering /work + /brain; Person JSON-LD sitewide + CreativeWork per study; OG/Twitter + generated 1200×630 stone og.png; `/llms.txt` covering all 11 projects.

**Part B, `/brain` content layer ([[Knowledge Graph]]):**
- `src/lib/brain.ts` parses the vault at build time (gray-matter + remark AST). Wikilinks incl. `[[Note|alias]]` → `/brain/[slug]`; rewrite on **text nodes only**, so the literal `[[wikilinks]]` in a code span is preserved (verified).
- All 28 notes render at `/brain/[slug]` with a "Linked from" backlinks panel (case-study-framework shows 9 backlinks); `/brain` index groups by type with excerpts + `#brain-graph-mount` for Phase 3. In-body wikilinks stay within-locale on non-English routes.

**Language rule respected:** English-only content; Phase 0 chrome translations + i18n scaffold untouched; non-English pages = English content, own chrome/fonts/direction.

**Verification:** Lighthouse (local, en) 99/100/96/100 across home + case study + brain index + note (96 = Speed Insights 404 on localhost → 100 on Vercel). Screenshots: home light/dark, 320px, Arabic mirrored, Urdu case study RTL, brain both themes. One h1/page; skip link intact; x-default on all 238 URLs.

**Open TODOs (Saif supplies):** `src/data/profile.ts` two stats; `[TODO:]` metric bullets in the 4 MDX files; real domain in `astro.config.mjs`. Shoppin' safe metrics per [[D014 - Shoppin Case Study Scope]].

Next: [[Roadmap|Phase 2]], motion layer.
