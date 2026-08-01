---
title: D008 - Fully Custom Analytics
type: decision
status: accepted
created: 2026-07-17
tags: [decision, analytics, flagship]
---

# D008: Analytics: fully custom pipeline

**Context:** Saif wants an in-site analytics product (like PostHog/CleverTap) showing real visitor behavior, explicitly to **showcase skill**.

**Options considered:**
- Capture with PostHog, build only the dashboard, fastest, reliable, but capture isn't "yours".
- **Fully custom**, own tracker + ingest + store + dashboard.

**Decision:** **Fully custom, end-to-end** (chosen by Saif). Implementation: [[Custom Analytics]].

**Why:** It's the strongest possible engineering proof under [[D001 - Site as Proof Principle]], the whole pipeline is demonstrably his. Designed to stay lightweight (~3KB tracker, lazy) and privacy-clean (cookieless, IP discarded).

**Trade-offs:** biggest single build chunk (its own [[Roadmap]] phase) and adds a datastore (Neon Postgres + Upstash Redis). Honest scaling note for interviews: a columnar store (ClickHouse/Tinybird) at real scale, knowing *when* to scale is itself the signal. Visibility open ([[Open Questions]] #5).
