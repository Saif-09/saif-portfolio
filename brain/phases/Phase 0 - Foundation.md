---
title: Phase 0 - Foundation
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log]
related: ["[[Roadmap]]", "[[D002 - Tech Stack]]", "[[Design System]]", "[[D011 - Colour Direction Stone]]"]
---

# ✅ Phase 0: Foundation (built & deployed)

Themed, multilingual, deployable shell. Built with Fable, deployed to Vercel.

**Shipped:**
- Astro 5 + React 19 islands + Tailwind 4 + TS; `@astrojs/vercel`; Speed Insights.
- Stone tokens for both themes; no-flash inline `<head>` theme script (localStorage → prefers-color-scheme), persisted toggle, no-JS OS fallback.
- All 7 locales route with correct `lang`/`dir`. Urdu mirrors fully (Nastaliq extra line-height so it doesn't clip).
- **Per-locale fonts verified:** built HTML has zero Noto refs on `en`/`hi-latn`; each script locale preloads only its own font. General Sans (38 KB) + Inter latin subset (48 KB) self-hosted, preloaded, `swap`.
- JS budget: only ThemeToggle (~1 KB) + LanguageSwitcher (~1.3 KB) hydrate (+ shared React runtime 58 KB gz, async). Rest static.

**Lighthouse:** en 99/100/96/100 · ur 92/100/96/100. BP 96 = Speed Insights 404 on localhost (100 on Vercel). Urdu perf 92 = 233 KB Nastaliq font on emulated mobile → subset further in a later phase.

**Judgment calls:**
- AA fix: light `--muted` #726D65 (4.28:1) → **#6D6961** (4.55:1). See [[D011 - Colour Direction Stone]].
- Deploy gotcha: parent `~/Developer/Workspace/vercel.json` (salutebutton) was hijacking `vercel link`; project got its own `vercel.json` + `.vercel` (salutebutton's file untouched).

**Deferred TODOs (before launch):** set real domain in `astro.config.mjs` `SITE` (drives canonical/hreflang); replace footer social placeholders + contact email (use `saifmd238@gmail.com` per spec, not the work email Fable stubbed).

Next: [[Roadmap|Phase 1]], content MVP + case studies + `/brain` note pages + SEO.
