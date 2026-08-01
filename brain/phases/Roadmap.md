---
title: Roadmap
type: phase
status: living
created: 2026-07-17
tags: [phase, roadmap]
---

# 🗺️ Build Roadmap

Each phase ends deployable to a Vercel preview. Built phase-by-phase in Fable.

- **✅ Phase 0, Foundation (done).** Astro + React + Tailwind + tokens (both themes, no-flash), i18n scaffold (all locales, `en` authored), Vercel project, per-locale fonts, nav (switcher + theme), Speed Insights. Build log: [[Phase 0 - Foundation]]. → [[D002 - Tech Stack]], [[Design System]]
- **✅ Phase 1, Content MVP (done).** All sections static + responsive; case studies ([[D004 - Case Study Framework]]); [[Contact Form]] UI; **vault parser + `/brain/[slug]` note pages + list view** ([[Knowledge Graph]]); SEO tags ([[D009 - SEO and AI Crawlers]]). Build log: [[Phase 1 - Content MVP]].
- **✅ Phase 2, Motion layer (done).** Lenis + ScrollTrigger reveals, pinned work, magnetic cursor; reduced-motion + RTL handling. Build log: [[Phase 2 - Motion]]. → [[D003 - Visual Restraint and One WebGL Moment]]
- **Phase 3, WebGL hero + graph view + demo.** ✅ **3A done:** [[WebGL Hero]] (lazy, poster fallback; plain three per [[D016 - WebGL Uses Plain Three Not R3F]]) + [[Knowledge Graph]] force-graph canvas + teaser. 🟡 **3B built (live answers pending Saif adding a card to AI Gateway):** [[Phase 3B - AI Ask This Site]]. Build log: [[Phase 3A - WebGL and Graph]].
- **✅ Phase 4, Analytics product (done, verified local; prod storage at launch).** Full custom pipeline. Build log: [[Phase 4 - Analytics]]. → [[Custom Analytics]], [[D008 - Fully Custom Analytics]]
- **✅ Phase 5, Contact backend + polish (done).** Serverless + Resend ([[D005 - Contact via Serverless]]); localized OG; axe/perf/SEO audit; RTL QA. Build log: [[Phase 5 - Contact and Polish]]. **English site feature-complete.**
- **✅ Phase 6, Translation tooling (done; full run at launch).** Built `scripts/translate.mjs` ([[D007 - Build-time AI Translation]]), dry-run, incremental manifest, validation, review gate ([[D006 - i18n Seven Languages and RTL]]). English-only until run ([[D015 - Defer Content Translation]]). Build log: [[Phase 6 - Translation Tooling]].
- **✅ Phase 7, Visual & IA Overhaul (done).** Multi-page + nav, visual richness, kill placeholders, rebuild Work, scrollytelling, RTL bidi fix. [[Phase 7 - Visual and IA Overhaul]] · [[D018 - Multi-page and Header Nav]] · [[D019 - Visual Richness Overhaul]].
- **🛠️ Phase 7b, Art Direction v2 (in progress).** Bold maximalist monochrome + wide bold type + GSAP scroll motion + "dead→alive" WebGL hero. Re-skin of the whole site (structure/engineering kept). Prompt `FABLE-ART-DIRECTION-V2.md`. → [[D020 - Art Direction v2 Bold Monochrome]].
- **Phase 8, Launch.** Domain, final QA, resume linked; flip each reviewed locale on. **Activate deferred external services** ([[D017 - Defer External Service Activation]]): add AI Gateway card + run AI-demo live grounding checks; provision free-tier Neon + Upstash and point env at them (analytics built/verified locally in Phase 4).

Definition of done per phase lives in the [[Portfolio Brain|spec]]. Open items: [[Open Questions]].
