---
title: Custom Analytics
type: feature
status: planned
created: 2026-07-17
tags: [feature, analytics, flagship]
related: ["[[D008 - Fully Custom Analytics]]"]
---

# Custom Analytics: "This site, measured"

A public, in-site analytics product built end-to-end, the flagship engineering proof. Decision + trade-offs: [[D008 - Fully Custom Analytics]].

**Pipeline (all yours):**
`custom ~3KB tracker → /api/track ingest → Neon Postgres + Upstash Redis → /api/insights (cached) → custom dashboard`

- **Tracker:** cookieless, lazy after LCP, one delegated click listener → {section, element, x%, y%}; scroll depth + time-on-section; named events (demo_used, cta_click, lang_change, theme_change); `sendBeacon` batching; DNT-aware.
- **Ingest:** validate, rate-limit, bot-filter, derive country from IP then **discard IP**.
- **Dashboard (`/analytics` + teaser):** live visitors, top sections, click map, scroll-depth curve, device/referrer/locale splits, landed→work→demo→contact funnel. Accessible chart alternatives.

Ties to [[Internationalization]] (locale split) and is the "I measure" beat of [[North Star - Site as Proof]]. Privacy note on the page is itself a maturity signal. Scaling answer: columnar store (ClickHouse/Tinybird) at real scale.

**As built ([[Phase 4 - Analytics]]):** 2.1KB tracker; env-driven `POSTGRES_URL` + `REDIS_URL`; country via `x-vercel-ip-country` (IP never parsed); session id in tab-scoped `sessionStorage` (cookieless, anonymous) for MPA funnel continuity; DNT + GPC make it inert. Prod storage wired at launch ([[D017 - Defer External Service Activation]]).
