---
title: D010 - Knowledge Graph Build in the Open
type: decision
status: accepted
created: 2026-07-17
tags: [decision, obsidian, graph, flagship]
---

# D010: Build-in-the-open knowledge graph

**Context:** Saif wants to document the whole project as an Obsidian-like graph of connected notes, rendered on the site *and* working in real Obsidian.

**Decision:** Maintain a real **Obsidian vault** (`/brain`) documenting every decision from day one, and render it on the site as an interactive force-directed graph. Implementation: [[Knowledge Graph]].

**Why:** Hiring managers rarely see *how* someone decided. A living decision graph shows judgment, trade-off awareness, and systems thinking directly, the "I reason / I document" meta-proof of [[North Star - Site as Proof]]. It also demonstrates real engineering (vault parsing, wikilink resolution, force-graph rendering) and pairs naturally with [[D009 - SEO and AI Crawlers]] (crawlable, citable reasoning).

**Trade-offs:** content discipline required, a note per decision, written when the decision is made. Vault is build-time static so it scales to hundreds of notes trivially. Public-scope/rawness open ([[Open Questions]] #7). This vault *is* the first instance of the feature.
