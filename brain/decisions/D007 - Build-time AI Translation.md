---
title: D007 - Build-time AI Translation
type: decision
status: accepted
created: 2026-07-17
tags: [decision, i18n, ai]
---

# D007: Translations: build-time AI from English

**Context:** [[D006 - i18n Seven Languages and RTL]] needs 6 non-English catalogs. Saif said translations come *from English*.

**Options considered:**
- Runtime translation, kills performance, SEO, caching. Rejected.
- Manual human translation only, highest quality, slowest/costliest.
- **Build-time AI translation (Claude) from the `en` catalog**, committed as static files, human-reviewed per locale.

**Decision:** build-time AI translation (chosen by Saif).

**Why:** SEO-clean + cacheable like human translation, cheap + fast like machine. English stays the single source of truth; a build script regenerates the others. On-brand for [[About Saif|Saif's]] AI skills.

**Trade-offs:** raw AI output needs a review gate before going live (esp. RTL/Nastaliq line-breaking + diacritics). Documenting that human-review gate is itself a mature-AI-usage signal. See [[Internationalization]].
