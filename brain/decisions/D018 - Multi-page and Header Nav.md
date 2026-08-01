---
title: D018 - Multi-page and Header Nav
type: decision
status: accepted
created: 2026-07-17
tags: [decision, ia, navigation]
related: ["[[D001 - Site as Proof Principle]]", "[[Phase 7 - Visual and IA Overhaul]]"]
---

# D018: Multi-page site + persistent header nav

**Context:** A UX audit (and Saif's own reaction) found the single-page structure (~11,000px scroll) had **no navigation**, you could only scroll or "back to top," couldn't jump to Work/Brain/Analytics from the top.

**Decision:** Convert to a **multi-page** site with a **persistent, responsive header nav**: Home · Work · About · Brain · Analytics · Contact (+ the existing language pill + theme toggle). Home becomes a concise landing (hero + highlights + teasers), not the whole story. Add subtle page transitions (Astro view transitions), reduced-motion-safe.

**Why:** Discoverability + a sense of a real product. Supersedes the original single-page IA, the felt experience beat the plan ([[D001 - Site as Proof Principle]]).

**Supersedes:** the single-page narrative in the original §2 IA. Case studies keep `/work/[slug]`; About / How-I-work / Contact get real pages.
