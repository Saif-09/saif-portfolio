---
title: D013 - Live Demo Ask This Site
type: decision
status: accepted
created: 2026-07-17
tags: [decision, feature, ai, demo]
related: ["[[Knowledge Graph]]", "[[D009 - SEO and AI Crawlers]]"]
---

# D013: Live demo: "Ask this site" AI toy

**Context:** Saif wants a small interactive toy on the site (confirmed). Needs to prove product craft first-hand.

**Options considered:**
- Distill a shipped product feature, high fidelity but lots of build per project.
- Embed [[Projects|Insomniac]] (existing web toy), cheapest, but generic.
- **"Ask this site"**, a tiny AI input answering questions about Saif, grounded in his project data.

**Decision:** **"Ask this site"** (AI toy). Alternative kept: embed Insomniac if a non-AI toy is preferred.

**Why:** No external product to clone; showcases Saif's AI strength directly; and it *ties the whole site together*, it answers **from** the [[Knowledge Graph|vault]] and the same `llms.txt` content that AI crawlers read ([[D009 - SEO and AI Crawlers]]). Memorable, on-brand, single-purpose.

**Tech:** Vercel AI SDK + AI Gateway, serverless, streamed, rate-limited, cheap model. Full loading/empty/error/rate-limited states (craft on display). Lazy island.

**Trade-offs:** needs guardrails (rate limit, scoped to grounded answers, refuse off-topic) and a small cost budget. Resolves [[Open Questions]] #3 (live demo).
