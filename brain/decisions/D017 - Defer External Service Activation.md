---
title: D017 - Defer External Service Activation
type: decision
status: accepted
created: 2026-07-17
tags: [decision, sequencing, billing]
related: ["[[Phase 3B - AI Ask This Site]]", "[[D015 - Defer Content Translation]]", "[[Custom Analytics]]"]
---

# D017: Defer paid / account-linked service activation to launch

**Context:** Some features need external services tied to Saif's billing/accounts, the [[Phase 3B - AI Ask This Site|AI demo]] needs a credit card on Vercel AI Gateway; the [[Custom Analytics|analytics]] pipeline needs a production Postgres + Redis. Saif wants to make billing/account decisions **at the end**, not mid-build.

**Decision:** **Build and verify every feature against local/dev services; defer production activation of paid/account-linked services to launch (Phase 7).**
- AI demo: leave live answers gated (graceful error state shown); add the card + run live grounding checks at launch.
- Analytics: build + verify against a **local Postgres + local/in-memory Redis**; keep the connection **env-driven** so pointing at production storage later is just env vars. (Neon + Upstash have no-card free tiers, so even prod likely needs no card, provisioned at launch.)
- Contact (Phase 5): build the Resend send path **env-driven** (`RESEND_API_KEY`); without a key the form degrades gracefully. Real key + verified sender domain added at launch.

**Why:** avoids committing to billing mid-build; features are fully built + verified now; activation is a fast, reversible env/dashboard step later. Same "do it once, at the end" logic as [[D015 - Defer Content Translation]].

**Trade-offs:** deployed previews show empty/seed or error states for these features until launch, acceptable and by design. Everything is reversible in minutes.
