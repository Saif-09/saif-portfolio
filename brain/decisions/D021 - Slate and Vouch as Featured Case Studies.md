---
title: D021 - Slate and Vouch as Featured Case Studies
type: decision
status: accepted
created: 2026-08-25
tags: [decision, content, work]
related: ["[[Projects]]", "[[D004 - Case Study Framework]]", "[[D012 - Work Section Structure]]"]
---

# D021: Slate and Vouch join the featured case studies

**Context:** Two things shipped after [[D012 - Work Section Structure]] was written and were missing from the site entirely. **Slate** is live on the Mac App Store (id 6796836834, v1.3, released 4 Aug 2026) with a paid unlock. **Vouch** is published on npm as `codevouch` and open on GitHub. Between them they are the only evidence on the site for two things the work now leads with: shipping a paid native app through Apple review alone, and building tooling for working with agents.

**Decision:** Both become **featured** deep case studies with `homeFeatured` on, ordered 3.5 (Slate) and 3.8 (Vouch), directly after Ueue in the Personal / Labs track.
- Slate leads on the render harness and the two App Store validation rejections, not on the feature list.
- Vouch leads on the Gap, the measurement it exists to produce, and on the unused-dependency check that fell out of grounding dependencies in real call sites.

**Why:** [[D012 - Work Section Structure]] says curating what earns a deep dive is itself the signal. A featured shortlist that omits the only App Store product and the only tool other developers install understates the work by exactly the two dimensions that are currently scarcest. Six home-featured entries still reads as a shortlist rather than a dump.

**Trade-offs:** the featured count goes from 4 to 6, which lengthens the homepage list. Vouch's visual is a screenshot of its GitHub README rather than a product landing page, because it has no public site and the npm page is behind a bot check; its `Web` link points at GitHub so the browser frame's domain matches what the shot actually shows. The npm link lives in the case-study body and the live-now strip instead.

**Follow-on:** `ProjectLink` gained a **Mac** label so the Mac App Store is a first-class store rather than being filed under `iOS`. It renders the Apple badge with the wording "Mac App Store", and counts toward `appsShipped` in [[D004 - Case Study Framework|the derived stats]], which moved to 8 apps and 9 live products. Both are still derived from the projects data, never hand-written.
