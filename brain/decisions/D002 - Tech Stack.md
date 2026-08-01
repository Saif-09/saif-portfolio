---
title: D002 - Tech Stack
type: decision
status: accepted
created: 2026-07-17
tags: [decision, stack, architecture]
---

# D002: Tech stack: Astro + React islands on Vercel

**Context:** Need elite performance, great SEO, multilingual routing, and a few rich interactive surfaces. Guided by [[D001 - Site as Proof Principle]].

**Options considered:**
- **Next.js 16**, familiar, powerful, great if this becomes an app; but heavier JS baseline → harder to hit a *flawless* Lighthouse on a content site.
- **Astro 5**, zero JS by default, first-class i18n, static-first; hydrate only interactive islands.

**Decision:** **Astro + React islands, on Vercel.** Next.js documented as the alternative.

**Why:** A portfolio is ~90% content. Astro ships the content as static HTML and hydrates only the islands ([[WebGL Hero]], [[Contact Form]], [[Custom Analytics]], [[Knowledge Graph]]). "I chose Astro *because* the workload is content-led" is itself the product-thinking answer.

**Trade-offs:** less familiar than Next for Saif; if it grows into a full app later, revisit. Enables the perf targets in [[Design System]] and [[Roadmap]] Phase 0.
