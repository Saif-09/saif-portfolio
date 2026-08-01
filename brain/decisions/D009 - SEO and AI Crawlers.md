---
title: D009 - SEO and AI Crawlers
type: decision
status: accepted
created: 2026-07-17
tags: [decision, seo, ai]
---

# D009: World-class SEO + AI-crawler friendly

**Context:** Saif wants best-in-class SEO and to be *allowed* and surfaced by AI crawlers.

**Decision:**
- `robots.txt` that **explicitly allows** AI crawlers (GPTBot, ClaudeBot/anthropic-ai, PerplexityBot, Google-Extended, CCBot, Applebot-Extended, Bytespider, etc.) + permissive default.
- `/llms.txt` (+ optional `/llms-full.txt`), clean Markdown summary for LLM consumption.
- Localized `sitemap.xml` (incl. [[Knowledge Graph]] notes), `hreflang` + `x-default`, per-page/locale meta + OG, JSON-LD (`Person`, `CreativeWork`, `WebSite`, `BreadcrumbList`).

**Why:** [[D002 - Tech Stack|Astro's]] server-rendered HTML means crawlers get full content without JS. Allowing AI crawlers means Saif's work (and his documented *reasoning* via [[Knowledge Graph]]) becomes citable in AI answers, a modern discoverability edge. `/llms.txt` is a subtle "ahead of the standards" signal, on-brand for [[About Saif]].

**Trade-offs:** allowing training crawlers means content may be used for training, accepted deliberately for visibility. Compounds with [[Internationalization]] (per-locale pages).
