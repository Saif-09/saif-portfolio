---
title: Phase 7 - Visual and IA Overhaul
type: phase
status: in-progress
created: 2026-07-17
tags: [phase, overhaul, design, ia]
related: ["[[Roadmap]]", "[[D018 - Multi-page and Header Nav]]", "[[D019 - Visual Richness Overhaul]]"]
---

# 🛠️ Phase 7: Visual & IA Overhaul (in progress)

Triggered by a UX audit (browser-driven) + Saif's reaction: the feature-complete English site read as "boring / cheap / off", text-heavy, no imagery/icons/badges, dead scroll space, empty-looking graph/analytics, single-page with no nav, and, worst, live `N` stats + `[TODO]` placeholders in case-study Outcomes. Audit scored it 6/10 ("smart skeleton shipped a week early"; taste + engineering senior, finish lacking).

**Scope (Fable prompt `FABLE-PHASE-7-OVERHAUL.md`, parts A–H):**
- A: multi-page + persistent header nav + page transitions; kill dead space ([[D018 - Multi-page and Header Nav]]).
- B: remove all visible `N` / `[TODO]` placeholders; fix Prism copy inconsistency.
- C: visual richness, real web screenshots, device mockups + store badges for apps, tech icons, logos ([[D019 - Visual Richness Overhaul]]).
- D: rebuild Work section (thumbnails, balanced layout, fix hover scroll-jump).
- E: case studies → scrollytelling + next-project nav.
- F: fix graph (typed/iconned nodes + legend, readable labels, reliable drag, click-to-focus) + blank homepage teaser canvas.
- G: analytics + loading + AI-error states look designed.
- H: motion polish + RTL bidi fix (`<bdi>` for English runs/numbers in ar/hi).

**Keep:** typography, Stone palette + one restrained accent (no rainbow), light/dark, i18n/RTL, analytics/graph/AI engineering, perf (Lighthouse 95+), axe AA, deferred-service states (D017), English-only.

**Blocked on Saif for full quality:** real homepage stat integers, real case-study Outcome metrics (incl. safe Shoppin' numbers), real app screenshots. Prompt degrades gracefully (device-mockup placeholders + qualitative copy) so nothing broken ships meanwhile.

Then: [[Roadmap|Phase 8]], launch.
