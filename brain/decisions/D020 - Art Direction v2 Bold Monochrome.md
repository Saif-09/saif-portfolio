---
title: D020 - Art Direction v2 Bold Monochrome
type: decision
status: accepted
created: 2026-07-17
tags: [decision, design, art-direction, webgl, motion]
related: ["[[D019 - Visual Richness Overhaul]]", "[[D011 - Colour Direction Stone]]", "[[D003 - Visual Restraint and One WebGL Moment]]", "[[WebGL Hero]]"]
---

# D020: Art direction v2: bold maximalist, monochrome, motion + "dead→alive" WebGL

**Context:** After the Phase 7 overhaul (multi-page, imagery, fixes), the *refined-minimal* look still read as "boring / not memorable / not unique" to Saif. We reset the direction: Saif chose **bold maximalist 2D**, wants **wide bold type (not condensed)**, **no red / monochrome**, **heavy GSAP scroll motion**, and **real Three.js/WebGL**. Approved via prototype `direction-v2-bold.html`.

**Decision, rebuild the visual language:**
- **Bold maximalist editorial**, **monochrome cream + ink** (keep light + dark; light is the showcase). **NO red / no chromatic accent**, boldness comes from massive type scale, stark contrast, and motion.
- **Type:** a WIDE, heavy display face (NOT condensed), e.g. Archivo Black / Clash Display / Bricolage Grotesque, huge, filling the viewport. Space Grotesk (UI) + Space Mono (labels). Per-locale Noto bold for non-Latin scripts stays.
- **Motion system:** Lenis + GSAP ScrollTrigger, split-text reveals, pinned scroll sequences, parallax, marquee tickers, magnetic hover, big interactive work-list rows, page transitions. Reduced-motion + RTL safe.
- **Hero WebGL "dead → alive":** a GLSL particle field (Three.js), a dormant dot-matrix that ignites into motion with cursor + scroll, literalizing "I build solutions, not **dead** software" ([[WebGL Hero]]). Scroll-driven ignition; lazy after LCP; capability-gated static fallback; pause off-screen.

**Keep:** all engineering + Phase 7 fixes (multi-page + nav, analytics, /brain graph, AI demo, i18n/RTL English-only, SEO, perf 95+, a11y AA, deferred-service states, real screenshots/store badges/device mockups, RTL bidi). Drop the muddy cloud backgrounds.

**Supersedes** [[D003 - Visual Restraint and One WebGL Moment]] (restraint was over-applied); **refines** [[D011 - Colour Direction Stone]] (monochrome kept, but bolder + cleaner) and [[D019 - Visual Richness Overhaul]]. "Not perfect but good to go", Saif, 2026-07-17.
