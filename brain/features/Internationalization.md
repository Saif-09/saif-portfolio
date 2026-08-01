---
title: Internationalization
type: feature
status: planned
created: 2026-07-17
tags: [feature, i18n, rtl]
related: ["[[D006 - i18n Seven Languages and RTL]]", "[[D007 - Build-time AI Translation]]"]
---

# Internationalization

Seven locales: English (source), Hindi, Kannada (Bangalore), Urdu, Telugu, Arabic, Hinglish. Urdu + Arabic are **RTL**. Full rationale + risk: [[D006 - i18n Seven Languages and RTL]].

- **Routing:** Astro i18n, `/[locale]/…`, `hreflang` + `x-default`.
- **Translation:** [[D007 - Build-time AI Translation]], generated from `en` at build time, committed static, reviewed per locale before going live.
- **RTL:** `dir` on `<html>` + logical CSS properties (see [[Design System]]) → layout mirrors automatically; directional icons flip; GSAP offsets negate.
- **Fonts:** Noto per script, **loaded per active locale only** (perf-critical, English visitors never download the Arabic font).

Feeds the locale breakdown in [[Custom Analytics]] and boosts reach for [[D009 - SEO and AI Crawlers]] (per-locale pages + hreflang).
