---
title: D019 - Visual Richness Overhaul
type: decision
status: accepted
created: 2026-07-17
tags: [decision, design, visuals]
related: ["[[D011 - Colour Direction Stone]]", "[[D003 - Visual Restraint and One WebGL Moment]]", "[[Phase 7 - Visual and IA Overhaul]]"]
---

# D019: Visual richness overhaul

**Context:** The English site shipped text-led with images deferred; the audit + Saif found it "boring / cheap / off", all text on near-black, no product screenshots, no icons, no App Store/Play Store badges, dead scroll space, empty-looking graph/analytics, and (worst) live `N` stats + `[TODO]` placeholders in case-study Outcomes.

**Decision, add real visual richness (keeping the Stone base + the strong typography/i18n/engineering):**
- **Imagery everywhere:** real screenshots of Saif's live web projects; device-frame mockups + official App Store / Play Store badges for the apps; product logos; tech-stack icons; section iconography.
- **Kill all visible placeholders**, no `N`, no `[TODO]`; real metrics or honest qualitative copy.
- **Case studies → scrollytelling** (sticky device frame + narrative + before/after) not walls of text; next-project nav.
- **Graph:** typed nodes (icon + tone + legend), readable labels (hover/zoom), reliable drag, click-to-focus; fix blank homepage teaser canvas.
- **Analytics + empty/loading + AI-error states** look designed (skeletons, styled error card w/ mailto).
- **Motion:** staggered reveals, magnetic hover, page transitions; FIX the scroll-jump on Work-card hover.

**Colour:** stay on the **Stone base** (light theme is a strength) + **one restrained accent** for emphasis/graph focus, richness comes from imagery/icons/motion, NOT a generic saturated palette ([[D011 - Colour Direction Stone]]; see the design-taste memory). A curated muted-editorial accent palette is optional pending Saif.

**Why:** "minimal" for Saif still means visually rich + impressive; sparse text read as unfinished. This makes the site walk its own "polish the states nobody screenshots" talk. Partially revisits [[D003 - Visual Restraint and One WebGL Moment]] (restraint was over-applied). Built in [[Phase 7 - Visual and IA Overhaul]].
