---
title: Phase 6 - Translation Tooling
type: phase
status: done
created: 2026-07-17
tags: [phase, build-log, i18n, ai]
related: ["[[Roadmap]]", "[[D007 - Build-time AI Translation]]", "[[D015 - Defer Content Translation]]", "[[D006 - i18n Seven Languages and RTL]]", "[[Internationalization]]"]
---

# ✅ Phase 6: Translation tooling (built & verified; full run deferred to launch)

The build-time AI translation script ([[D007 - Build-time AI Translation]]). Tooling done + mock-verified; the real run happens at launch on final English (D015) once the AI key is active. Deployed preview = byte-equivalent English behavior (all mock artifacts removed, manifest reset).

**`scripts/translate.mjs`**, `npm run translate -- <flags>` (the `--` matters; bare `--dry-run` gets eaten by npm). English = sole source. Targets hi, kn, te, ur, ar, hi-Latn. **Hinglish has a dedicated prompt**, natural casual romanized Hindi ("maine ye app scratch se banaya" register), explicitly NOT transliteration. AI SDK via the same Gateway as /api/ask, Sonnet-class model, temp 0.2, hard-rules system prompt: preserve structure / frontmatter keys / wikilink targets / code / URLs; never translate the 10 product names + tech terms + "Mohd Saif"; RTL for ur/ar; confident-plain-senior tone.

**Covers:** UI catalogs (only keys MISSING from hand-authored files, Phase 0's 7 per-locale translations provably excluded: plan shows hi needs 131 keys vs hi-Latn 138), all case-study MDX → `src/content/work/<locale>/`, and `--brain` (opt-in) for note bodies (36 notes × 6, plan grew automatically as the vault grew).

**Safety rails, each verified:**
- Dry-run: full plan (6 catalog batches / 799 keys + 24 case studies), zero API calls, zero writes.
- No key → clean exit 0 with "activates at launch (D017)" message.
- Incremental manifest (per-key hashes for catalogs, per-file for MDX/notes): re-run skipped unchanged; a simulated English change re-planned exactly that one file.
- Post-translation validation REJECTS output where URLs / wikilink targets / code fences / frontmatter keys / proper nouns don't survive, failed files reported, never written.
- `--mock` exercises the full pipeline with no API spend (how it was tested pre-card).

**D006 review gate**, wired + build-verified both ways: output lands as `translationStatus: machine` (site keeps English fallback); flipping to `reviewed` (manifest for catalogs/notes, frontmatter for MDX) makes it live. Proven with a marker: reviewed → shows on /hi/ only; machine → English fallback everywhere, machine MDX never renders.

**Latent bug fixed:** `deepMerge` was spreading arrays into objects (`{0:…,1:…}`), would have corrupted any catalog with arrays.

**Launch run:** (1) `vercel env pull` / export key once Gateway card is in; (2) `npm run translate -- --sample --only=hi` → eyeball → full `npm run translate` (+`--brain` to localize the vault); (3) review, flip to reviewed, commit, deploy.

**🏁 All six build phases complete.** Launch = the 4 env/account actions + metrics + review (see `LAUNCH-CHECKLIST.md`).
