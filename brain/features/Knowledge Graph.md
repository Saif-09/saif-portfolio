---
title: Knowledge Graph
type: feature
status: planned
created: 2026-07-17
tags: [feature, obsidian, graph, flagship]
related: ["[[D010 - Knowledge Graph Build in the Open]]"]
---

# Knowledge Graph: "Built in the open"

This very vault, rendered on the site as an interactive **Obsidian-style graph**. The "I document / I reason" meta-proof of [[North Star - Site as Proof]]. Decision: [[D010 - Knowledge Graph Build in the Open]].

**Architecture:**
`/brain vault (.md + [[wikilinks]] + frontmatter) → build-time parser (gray-matter + remark) → graph.json + note HTML + backlinks → /brain graph island + /brain/[slug] pages`

- **Render:** `d3-force` on custom `<canvas>`, node size by degree, color by note `type`, hover highlights neighbors + dims rest, pan/zoom/drag, tag filter. (`react-force-graph-2d` is the faster alt.)
- **Accessibility:** every note is a crawlable HTML page reachable via a **list/tree fallback**; reduced-motion → static pre-computed layout; canvas `aria-hidden`.
- **SEO:** notes in the sitemap + AI-crawler-visible → your *reasoning* becomes citable ([[D009 - SEO and AI Crawlers]]).
- **Opens in real Obsidian**, the `/brain` folder is a genuine vault.

Living-doc discipline: one note per decision, created when made. This node graph you're reading *is* the feature.
