---
title: Phase 5 - Contact and Polish
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log, contact, a11y, seo]
related: ["[[Roadmap]]", "[[Contact Form]]", "[[D005 - Contact via Serverless]]", "[[D017 - Defer External Service Activation]]", "[[Phase 2 - Motion]]"]
---

# ✅ Phase 5: Contact backend + full polish/QA (done)

Contact wired + a comprehensive audit pass. English site now **feature-complete**. Deployed to preview.

**Part A, Contact ([[Contact Form]]):** `/api/contact` validates length + email, honeypot (clip-path hidden, tabindex -1, aria-hidden) → fake success, 5/min/IP → 429, swallows spam (link-stuffing/shouting/keywords). Resend send, reply-to = submitter, Stone plain+HTML template → saifmd238@gmail.com. **Env-driven:** no `RESEND_API_KEY` → `{ok, simulated}` (verified dev + preview). Form success/error/rate-limited states drive off real responses, aria-live intact; verified end-to-end in browser.

**Part B, audit results:**
- **Phase 2 watch item fixed:** keyboard focus into either pinned featured card scrubs the pin to fully reveal it (0.5/covered → focus link → opacity 1, in viewport, focus retained). SR reachability never blocked (opacity ≠ hidden); Shoppin also reachable via sitemap/llms/graph.
- **axe WCAG 2.1 AA: zero violations** across 8 combos (/, /work/shoppin, /brain, /analytics × themes + /ar/ + /ur/work/shoppin). Skip link first Tab; canvases aria-hidden; one h1/main.
- **Localized OG:** 7 per-locale home cards (native names, Nastaliq+RTL verified) + 4 case-study cards via `scripts/generate-og.mjs`; correct `og:locale` (ur_PK, ar_AE…) + per-page `og:image`; all 294 pages point at an existing file.
- **SEO:** clean, 294 sitemap URLs resolve, x-default everywhere, canonicals exact, JSON-LD parses, zero broken internal links, 16 AI crawlers in robots.txt, llms.txt present, English pages ship zero Noto bytes.
- **Lighthouse matrix** (4 pages × mobile/desktop): desktop 100 perf; mobile 96–97; a11y 100 + SEO 100 all 8; CLS 0, TBT 0. (BP 96 = localhost Speed Insights 404.)
- **Cross-browser:** Firefox 152 + Chromium clean; no overflow 320px→4K; RTL re-verified via axe on ar/ur.

**Punch list (deferred, intentional):**
1. Safari/WebKit automated run needs admin pw → do one **manual Safari pass** at launch.
2. Launch env vars (each activates a finished feature): AI Gateway card → /api/ask; Neon+Upstash → analytics; RESEND_API_KEY (+ CONTACT_FROM after domain verify) → real email. ([[D017 - Defer External Service Activation]])
3. Real domain: `SITE` in astro.config + robots sitemap line + regenerate OG (footer prints placeholder domain).
4. Bulk translation ([[D015 - Defer Content Translation]]), Phase 6.
5. Field INP from Speed Insights once domain live.

Next: [[Roadmap|Phase 6]], translation tooling; then Phase 7 launch.
