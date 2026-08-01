---
title: D015 - Defer Content Translation
type: decision
status: accepted
created: 2026-07-17
tags: [decision, i18n, sequencing]
related: ["[[D006 - i18n Seven Languages and RTL]]", "[[D007 - Build-time AI Translation]]"]
---

# D015: Defer bulk content translation to a final pass

**Context:** Having Fable translate large content (About, case studies, section copy, brain notes) into 6 locales mid-build burns a lot of tokens for little value, the audience reads English anyway, and translation is a build-time script's job, not Fable's.

**Decision:** Through **all build phases, author content in English only.** Non-English locales **fall back to English** key-by-key (already the wired behavior). Run the **full content translation as the final step**, via the build-time AI script from [[D007 - Build-time AI Translation]] (cheap, outside Fable), then per-locale review ([[D006 - i18n Seven Languages and RTL]]).

**Do NOT touch** the i18n scaffold or the small UI-chrome strings already translated in [[Phase 0 - Foundation]] (nav, switcher, theme labels), those stay.

**Why:** token efficiency; keeps Fable focused on building, not translating; English reaches the whole target audience in the meantime; translation stays a deterministic, reviewable build-time artifact.

**Trade-offs:** non-English visitors see English body content until the final pass, acceptable and reversible. See [[Roadmap]] (translation pass added pre-launch).

**Confirmed (chose A):** Fable never hand-translates in *any* scenario (context bloat + poor quality), so the token worry is moot regardless. The deferral is purely about translating *final* copy once instead of re-translating changing copy every phase. An early translation pass can be run **on demand** at any checkpoint (it's the build-time script, not Fable), but the default is the single end-of-build pass.
