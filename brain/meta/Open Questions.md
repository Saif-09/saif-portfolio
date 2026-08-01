---
title: Open Questions
type: meta
status: resolved
created: 2026-07-17
tags: [meta, open-questions]
---

# ❓ Open Questions (as of 2026-07-17)

All planning decisions are now resolved or defaulted, the plan is build-ready. Resolve → convert into a `D0xx` decision note.

## ✅ Resolved (decision notes)
- [[D002 - Tech Stack]] · [[D003 - Visual Restraint and One WebGL Moment]] · [[D004 - Case Study Framework]] · [[D005 - Contact via Serverless]]
- [[D006 - i18n Seven Languages and RTL]] · [[D007 - Build-time AI Translation]] · [[D008 - Fully Custom Analytics]] · [[D009 - SEO and AI Crawlers]]
- [[D010 - Knowledge Graph Build in the Open]] · [[D011 - Colour Direction Stone]] · [[D012 - Work Section Structure]] · [[D013 - Live Demo Ask This Site]] · [[D014 - Shoppin Case Study Scope]] · [[D015 - Defer Content Translation]]

## ⚙️ Defaulted (change anytime)
- **Language launch**, `en` first, flip each locale on as its review clears. See [[D006 - i18n Seven Languages and RTL]].
- **Analytics visibility**, fully public. See [[Custom Analytics]].
- **Consent**, cookieless + DNT, no banner (no PII).
- **Knowledge-graph scope**, full decision trail incl. rejected options; exclude anything sensitive. See [[Knowledge Graph]].
- **Portrait**, type-led; optional small portrait later.
- **Domain**, **`saifsiddiqui.in`** (set `SITE` at launch; drives canonical/sitemap/llms.txt/OG + AI-crawler readability).
- **Fonts**, General Sans + Inter + Noto per script. See [[Design System]].

## ⏳ Ongoing (Saif supplies during build)
- **Metrics**, Outcome slots per featured case study ([[D004 - Case Study Framework]]) + the 2 homepage stat integers (kill the "N").
- **Shoppin' numbers**, specific safe-to-share metrics ([[D014 - Shoppin Case Study Scope]]).
- **App screenshots**, real screens for Shoppin'/Wellbeing/Zenzop/Gurucool/Zazz ([[D019 - Visual Richness Overhaul]]); device-mockup placeholders until then. Portrait photo optional.
- **More colour?**, Stone + one accent by default; Saif may request a curated muted-editorial accent palette.

## 🗓️ Deferred to launch ([[D017 - Defer External Service Activation]])
- **AI Gateway card**, add at launch → AI demo answers live.
- **Prod analytics storage**, provision free-tier Neon + Upstash at launch (built/verified locally in Phase 4).
- **Resend key + sender domain**, contact email sending activates at launch (built env-driven in Phase 5).
