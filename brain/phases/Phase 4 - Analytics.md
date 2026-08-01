---
title: Phase 4 - Analytics
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log, analytics, flagship]
related: ["[[Roadmap]]", "[[Custom Analytics]]", "[[D008 - Fully Custom Analytics]]", "[[D017 - Defer External Service Activation]]"]
---

# ✅ Phase 4: Fully-custom analytics (built & verified locally; deployed with empty state)

The flagship engineering showcase ([[D008 - Fully Custom Analytics]]). Works end-to-end against local storage; deployed to preview with the designed empty state (prod storage wired at launch per [[D017 - Defer External Service Activation]]).

**Tracker**, 2.1KB gz (budget ~3KB), cookieless, hydrates at idle, starts after load. Captures pageview (path/locale/referrer-host/device/viewport), 25/50/75/100% scroll, per-section attention (IntersectionObserver), one delegated click listener → {section, stable selector, normalized x/y}. All 6 named events wired: theme_change, lang_change, work_card_click, cta_click (delegated), demo_used + graph_node_click (via `emitTrack()`, inert if tracker off). Flush via sendBeacon every 8s + visibilitychange/pagehide. **DNT + Global Privacy Control → fully inert.**

**Pipeline**, `/api/track`: event-type allowlist + size caps, bot-UA drop, 60 batches/min/IP, country from `x-vercel-ip-country` (IP never parsed for storage), batch insert → Postgres, bump KV live-set + daily counter. `/api/insights`: SQL aggregations behind 60s KV cache (verified: 2 fetches share one generatedAt). `/api/live`: KV only.

**Storage**, env-driven: `POSTGRES_URL` + `REDIS_URL` only. Verified against local brew Postgres 16 + Redis. Unset → writes drop, reads empty, dashboard shows empty state (= current preview). Go-live = paste Neon + Upstash URLs into Vercel env; schema auto-creates.

**Dashboard + teaser**, `/analytics` (all 7 locales): live-now / pageviews / uniques (count-up, instant under reduced-motion), 24h/7d/30d, top-sections, scroll-depth curve, click map over dimmed homepage snapshot (15KB jpg), device/OS/browser, referrers, locales, 4-step funnel, every chart has a `<details>` data-table twin + labeled SVG. Privacy panel ("What I measure, and what I don't"). §06 "This site, measured" between AI demo (05) and graph teaser (07): 4 live tiles + dashboard link.

**Two honest deviations:**
1. **Session id in `sessionStorage`** (random UUID, tab-scoped, 30-min rotation) instead of pure in-memory, the funnel needs cross-page continuity in an MPA. Still cookieless, anonymous, no PII; cleared on tab close. Privacy claims hold.
2. Uses `x-vercel-ip-country` header (never parses the IP), even cleaner than the specced "derive then discard".

**Verified (20/20):** scripted journey → all 8 event types in Postgres; funnel landed 1→work 1→demo 1→contacted 0; live counter 1→2 across contexts; teaser real numbers (avg scroll 63%); RTL /ar/analytics mirrored; raw-row audit = no IP, no UA, no PII (no columns exist for them). Lighthouse 100/100/96/100 on / and /analytics, LCP 0.5–0.6s, CLS 0, TBT 0, tracker no measurable CWV cost.

**Testing gotcha (for future E2E):** the bot filter correctly catches headless Chrome → E2E tests must spoof a real UA.

Next: [[Roadmap|Phase 5]], contact backend + full polish/QA.
