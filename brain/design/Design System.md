---
title: Design System
type: design
status: accepted
created: 2026-07-17
tags: [design, system]
related: ["[[D003 - Visual Restraint and One WebGL Moment]]", "[[D011 - Colour Direction Stone]]"]
---

# 🎨 Design System

Principle: minimal, editorial, timeless. Whitespace + type do the work; motion is seasoning. Reinforces [[North Star - Site as Proof]], restraint reads as taste.

**Type:** variable display (General Sans / Aeonik) + text (Inter / Geist); non-Latin via Noto per script (see [[Internationalization]]). Fluid `clamp()` scale, body ≤ 68ch.

**Color:** "Stone", warm greige, **hueless**; accent is charcoal (light) / warm stone (dark). Full tokens + rationale: [[D011 - Colour Direction Stone]]. Tokens for **both** light + dark, verified AA in both themes and all scripts. No-flash theme script.

**Spacing/grid:** 8px scale; 12-col fluid grid; generous vertical rhythm. **Logical properties** everywhere so RTL mirrors automatically.

**Motion:** micro 150–250ms, reveals 400–700ms, hero ~1s; `expo.out` easing; animate on enter once; transforms/opacity only; `prefers-reduced-motion` → final states. Full mapping in [[D003 - Visual Restraint and One WebGL Moment]].
