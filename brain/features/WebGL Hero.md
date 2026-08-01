---
title: WebGL Hero
type: feature
status: planned
created: 2026-07-17
tags: [feature, motion, webgl]
related: ["[[D003 - Visual Restraint and One WebGL Moment]]"]
---

# WebGL Hero

The single "wow" beat: a calm domain-warped fbm "graphite dust" field in Stone tones behind sharp type, subtle cursor reaction, settles on load. **Plain three.js** (named imports, not R3F, see [[D016 - WebGL Uses Plain Three Not R3F]]) in a **lazy island** mounted after LCP so it never touches the critical path.

**Budget:** ~129KB gz (raw-WebGL ~3KB option open, D016), DPR ≤ 1.5, pause when off-screen/tab hidden, 60fps target / 30 floor.
**Degradation:** reduced-motion / mobile / low-power → static poster image (WebGL + `deviceMemory` feature-detect).

Why exactly one: concentrating the heavy effect in one place keeps everything else instant, the contrast *is* the [[North Star - Site as Proof|product signal]]. Rationale: [[D003 - Visual Restraint and One WebGL Moment]]. Style tokens: [[Design System]].
