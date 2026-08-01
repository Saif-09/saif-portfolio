---
title: D011 - Colour Direction Stone
type: decision
status: accepted
created: 2026-07-17
tags: [decision, design, color]
related: ["[[Design System]]", "[[D003 - Visual Restraint and One WebGL Moment]]"]
---

# D011: Colour direction: "Stone" (tonal, no hue)

**Context:** Needed an accent/colour system. Saif explicitly rejected the generic AI-default palette (saturated blue/purple/green/orange/neon) as a template tell.

**Options considered** (shown as a visual light+dark mockup board, not hex lists):
- **Ink & Bone**, pure monochrome, warm bone + near-black.
- **Oxblood**, one deep desaturated wine-red signature hue.
- **Espresso**, warm brown → caramel on dark.
- **Stone**, tonal warm greige, no chromatic hue. ← chosen.

**Decision:** **Stone.** Warm greige paper, charcoal ink; accent is deep charcoal (light) / warm stone (dark). No chromatic colour.

**Tokens:**
```
        Light      Dark
bg      #EDEAE4    #14130F
surface #F7F5F1    #1C1A16
ink     #201E1B    #EAE6DE
muted   #6D6961    #8F897E
line    #DAD5CC    #262320
accent  #2B2825    #B9B2A4
```

**Why:** Gallery-like and calm; forces type, whitespace, and motion to carry the drama, the craft signal of [[North Star - Site as Proof]] and [[D003 - Visual Restraint and One WebGL Moment]]. Hueless = the least "templated" answer possible. Applied in [[Design System]].

**Trade-offs:** no colour "pop" for attention-grabbing; mitigated by contrast + motion. Escape hatch: if a signature hue is ever needed, add **one** restrained tone (e.g. oxblood `#6E2A2A`) very sparingly. Resolves [[Open Questions]] #1.

**Revision (Phase 0):** light `--muted` moved #726D65 → **#6D6961**, the original measured 4.28:1 on `--bg`, just under the AA 4.5:1 bar; #6D6961 hits 4.55:1 and is visually identical. See [[Phase 0 - Foundation]].
