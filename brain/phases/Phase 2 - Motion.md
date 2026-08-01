---
title: Phase 2 - Motion
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log, motion]
related: ["[[Roadmap]]", "[[D003 - Visual Restraint and One WebGL Moment]]", "[[Design System]]"]
---

# ✅ Phase 2: Motion layer (built & deployed)

Premium scroll motion on the Phase 1 site. No content/SEO/i18n files touched (only motion attributes on existing markup). Deployed to Vercel preview.

**How it's built:**
- One island `MotionRoot.tsx` in base layout, `client:idle`, renders nothing; dynamic-imports Lenis + GSAP/ScrollTrigger **only when motion is allowed** (reduced-motion users don't run it). Lenis on GSAP rAF ticker, synced to ScrollTrigger; anchors route through `lenis.scrollTo`.
- Hero entrance = **pure CSS** keyframes (exact `cubic-bezier(0.16,1,0.3,1)`), no JS dep, removed wholesale under reduced-motion. `#hero-webgl-mount` untouched.
- Reveals: `data-reveal`; island **only arms elements still below the viewport** → anything being read stays put → zero flash, zero CLS by construction. `ScrollTrigger.batch`, enter-once, 0.6s expo-out, 0.08s stagger, will-change scoped + cleared. Contact form has no reveal hooks.
- Pinned work transition: each track's 2 featured cards → pinned stage (desktop + fine pointer + below-fold only); card 2 scrubbed cross-fade/parallax over card 1. Mobile/touch/reduced-motion → static stacked grid (class never applied).
- Magnetic cursor on hero scroll cue (inner wrapper, doesn't fight centering) + CSS hover lifts on work/brain cards, gated behind `(hover:hover)`, `(pointer:fine)`, `prefers-reduced-motion: no-preference`.

**Verified in real Chrome:** motion-on (Lenis active, 24 below-fold armed, 0 visible ever hidden, both stages pinned, reveals fire once + clear will-change); RTL pin exact mirror on /ar/ (card 2: +1267→0 LTR, −1267→0 RTL); reduced-motion tears down live to final states; touch 390px no pin/cursor; keyboard focus scrolls off-screen links into view with Lenis. **Lighthouse:** mobile 97/100/96/100, desktop 100/100/96/100, CLS 0, TBT 0ms (96 = localhost Speed Insights 404).

**⚠️ Watch item:** the first featured card intentionally ends at **opacity 0.5** behind the covering card at the pin's end state. Confirm in a later pass that card 1's links stay **keyboard-focusable + screen-reader reachable** (focusing it should scrub the pin back to reveal it), and that 0.5-opacity text isn't the only path to that case study. Low priority; note for Phase 3/QA.

Next: [[Roadmap|Phase 3]], WebGL hero + graph canvas + AI live demo.
