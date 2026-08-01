---
title: D016 - WebGL Uses Plain Three Not R3F
type: decision
status: accepted
created: 2026-07-17
tags: [decision, webgl, performance]
related: ["[[WebGL Hero]]", "[[D003 - Visual Restraint and One WebGL Moment]]", "[[Phase 3A - WebGL and Graph]]"]
---

# D016: Hero uses plain three.js, not R3F

**Context:** The spec specified React Three Fiber (R3F) for the [[WebGL Hero]] with a `< ~120KB gz` budget. In practice those conflict: R3F v9 dynamic-imports the whole `three` namespace → measured **241KB gz**, double the budget.

**Decision:** Rewrote the scene as **plain three.js with named imports**, **129KB gz**, same visual, same React lifecycle. Accepted (shipped in [[Phase 3A - WebGL and Graph]]).

**Why:** Honors the "performance is a feature" principle ([[North Star - Site as Proof]]) without changing the look. 129KB is marginally over the ~120KB target but is **lazy, post-LCP, desktop-only** (degraded devices download none of it), so real-world impact is negligible, desktop LCP measured 0.6s.

**Open option (Saif's call):** the shader is simple enough to run on **raw WebGL (~3KB)**, dropping ~126KB. Recommended if we want the budget met with huge margin; the only cost is a bit more bespoke GL boilerplate and less future scene flexibility (unlikely to matter for one static field). If chosen, update this note.

**Trade-offs:** plain three = manual scene wiring vs R3F ergonomics; fine for a single field. Supersedes the "R3F" mention in the stack table + [[WebGL Hero]].
