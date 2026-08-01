---
title: D006 - i18n Seven Languages and RTL
type: decision
status: accepted
created: 2026-07-17
tags: [decision, i18n, rtl]
---

# D006: i18n: seven languages + RTL

**Context:** Saif wants the site in English, Hindi, Kannada (Bangalore), Urdu, Telugu, Arabic, and Hinglish. Urdu + Arabic are RTL; four are non-Latin scripts.

**Decision:** Build full i18n for all 7 via [[D002 - Tech Stack|Astro i18n]], per-locale routes, `hreflang`, `dir` switching, per-locale Noto fonts. Implementation in [[Internationalization]]. Translation mechanism in [[D007 - Build-time AI Translation]].

**Why:** For this audience (recruiters/clients read English) multi-language is a **capability demonstration**, which is legitimate under [[D001 - Site as Proof Principle]], i18n + RTL is genuinely hard and signals senior engineering.

**Risk / trade-off (important):** quality is binary, fluent Urdu/Kannada impresses; sloppy machine output *hurts* the signal. Mitigation: English is canonical; each locale ships live only after a review pass. Launch scope + reviewers open ([[Open Questions]] #4). RTL handled via logical CSS ([[Design System]]).
