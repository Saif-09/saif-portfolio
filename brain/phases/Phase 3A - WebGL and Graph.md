---
title: Phase 3A - WebGL and Graph
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log, webgl, graph]
related: ["[[Roadmap]]", "[[WebGL Hero]]", "[[Knowledge Graph]]", "[[D016 - WebGL Uses Plain Three Not R3F]]", "[[D011 - Colour Direction Stone]]"]
---

# ✅ Phase 3A: WebGL hero + graph canvas (built & deployed)

The two flagship visual moments, into the existing mount points. Deployed to Vercel preview.

**1) WebGL hero ([[WebGL Hero]]):** domain-warped fbm "graphite dust" field in Stone tones, cursor-reactive, settles over ~1.8s, layered over a pure-CSS Stone poster fallback. Gate island checks reduced-motion + coarse pointer + viewport + deviceMemory/cores ≤ 4 + real WebGL before importing the heavy chunk, degraded devices download none (verified via network capture). DPR capped 1.5; fps floor drops DPR then bails to poster; render loop pauses off-screen + hidden tab (4 pause/resume paths verified via 2Hz heartbeat). Canvas aria-hidden, pointer-events none. **Deviation:** plain three (129KB gz) instead of R3F (241KB), see [[D016 - WebGL Uses Plain Three Not R3F]].

**2) Graph canvas ([[Knowledge Graph]]):** `/graph.json` emitted at build from the Phase 1 parser (auto-picked up new notes → 30 nodes / 131 links). `/brain` canvas is Obsidian-faithful: size = degree, tone = type (6 bg→ink mixes, no hue), force layout warmed off-screen + fit-to-view. Hover dims non-neighbors + tooltip; click → note (verified end-to-end); pan/zoom/drag; filter dims non-matches. Reduced-motion → synchronous static layout (pixel-identical). Phase 1 list stays as accessible path. Updated the `/brain` lead line that still promised the graph "later".

**3) "Built in the open" teaser:** new section between Selected Work and How I Work (05/06 slots noted in a comment), 8-node subgraph around [[Portfolio Brain]] drifting (pauses off-screen, static under reduced-motion), "Explore the full graph →" to /brain. RTL mirrors + arrow flips on /ur/ + /ar/ (verified).

**Two LCP bugs found & fixed:** (a) poster's data-URI noise made the poster div the LCP element (url() images count, gradients don't) → noise moved to `mask-image` on a pseudo-element; (b) Phase 2 fade meant h1 first painted at opacity 0 and lost LCP candidacy (had silently fallen to header site-name) → name now enters transform-only, LCP element is `h1.hero-name` at 88ms.

**Scores:** Desktop 100/100/96/100, LCP 0.6s (WebGL running), CLS 0, TBT 0ms, on / and /brain. Mobile 97 with no WebGL downloaded. (96 = localhost Speed Insights 404.)

Next: [[Roadmap|Phase 3B]], the "Ask this site" AI demo (needs Vercel AI Gateway key).
