---
title: D022 - Ziyarex OreoNotch and Clickk on the Site
type: decision
status: accepted
created: 2026-08-25
tags: [decision, content, work]
related: ["[[Projects]]", "[[D012 - Work Section Structure]]", "[[D021 - Slate and Vouch as Featured Case Studies]]", "[[D004 - Case Study Framework]]"]
---

# D022: Ziyarex leads the personal track; OreoNotch featured, Clickk on the grid

**Context:** [[D021 - Slate and Vouch as Featured Case Studies]] closed two gaps and missed three more. **Ziyarex** had grown from the spec's "studio front door" into a live product in its own right: 11 apps in the store, a 24-app hand-picked Discover shelf, 12 free tools, a 24-piece journal, per-app use cases, accounts, licence keys and a public products API. **OreoNotch** ships at 0.2.0, notarised, with a $12.99 licence and its own Sparkle feed. **Clickk** is live and licence-gated. None of the three appeared anywhere on the site.

**Decision:**
- **Ziyarex** opens the Personal / Labs track at order 2.9, featured and home-featured. It is the only entry that is a system rather than an app, and it is the container the other products sit in, so it reads first.
- **OreoNotch** gets a featured case study at order 3.6, but **not** home-featured. The homepage shortlist stays at seven.
- **Clickk** is a grid link-card with no case study, alongside Salute Button and Zazz.

**Why:** [[D012 - Work Section Structure]] says the curation is the signal, and the signal was wrong in both directions: the largest system on the site was absent, while the shortlist risked becoming a list of everything. Ziyarex first also fixes the narrative order, since a visitor who meets Slate, OreoNotch and Clickk without meeting the studio reads them as five unrelated hobby apps rather than one shelf.

**Trade-offs:** Clickk's grid card means its interactive keyboard demo, the best thing about the site, goes unmentioned. OreoNotch's case study describes the shipping app at 0.2.0 and deliberately says nothing about the sandboxed Mac App Store build or iCloud sync, both of which are planned and unbuilt. Adding either later is an edit to one paragraph.

**Not portfolio work:** **LinkPeek** is on the Ziyarex shelf and was built solo by Kedar Deshmukh. It stays off [[Projects]] as Saif's work and appears in the Ziyarex case study only as the studio decision it illustrates: the `maker` field means credit follows an outside maker's app everywhere, down to Person authorship in the structured data. See the note at the foot of [[Projects]].

**Found while writing this:** the products manifest prices OreoNotch at `$12` while the live site and its checkout say **$12.99**. Since that manifest is the single source of truth for the store, the homepage, the OG images, the public API and the strip on nine subdomains, the store is understating the price everywhere except the page that takes the money. Fix in `lib/products.ts`, not in the site.
