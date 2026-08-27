# Resume source

`resume.tex` is the source of truth for **four** resumes. There is one copy of
your history; only five pieces swap per variant. Never fork the file.

## The variants

| Variant | URL | Leads with |
|---|---|---|
| `fullstack` (default) | `saifsiddiqui.in/resume` | Backend & APIs, shipping end to end |
| `mobile` | `saifsiddiqui.in/resume/mobile` | Frontend & Mobile, native work, app-store releases |
| `ai` | `saifsiddiqui.in/resume/ai` | AI & Analytics, LLM pipelines, streaming |
| `product` | `saifsiddiqui.in/resume/product` | Technical PM on AI products: scope, build, measure |

`/cv`, `/resume.pdf` and `/resume/fullstack` all land on the default.
Each downloads as `Mohd_Saif_Resume[_Variant].pdf`.

## Updating it quickly

Edit `resume.tex`, push to `main`. CI compiles all four, refuses to publish if
any is not exactly one page, commits the PDFs, and Vercel deploys. Roughly a
minute end to end. Three ways in, no local LaTeX needed for the first two:

1. **From a phone or any browser:** open the repo on github.dev, edit
   `resume/resume.tex`, commit to `main`.
2. **From here:** edit and `git push`.
3. **Locally, to preview before pushing:** needs a TeX distribution with
   `fontawesome5`, `extarticle` and `glyphtounicode` (`brew install --cask
   mactex-no-gui`), then `./build.sh` (all) or `./build.sh product` (one).
   PDFs land in `resume/out/`, which is gitignored. Without a local TeX, the
   same thing runs in Docker:

   ```sh
   docker run --rm -v "$PWD:$PWD" -w "$PWD" \
     ghcr.io/xu-cheng/texlive-full:latest bash resume/build.sh
   ```

**A change that applies to every variant** (a new job, a reworded bullet, a new
skill) is a single edit in the body, exactly like a normal resume. Only reach
for the variant machinery when the wording should differ *by role*.

## The five swappable pieces

All variant logic lives in one block near the top of `resume.tex`. Nothing is
conditional in the body, so the body stays readable.

| Macro | What it controls |
|---|---|
| `\summaryBody` | The opening paragraph, minus the shared "Also ships" sentence |
| `\roleTitle` | The job title shown for Zenzop and Infinite Locus |
| `\skillsOrder` | Which of Backend / Mobile / AI skill lines comes first |
| `\shoppinOrder` | The order of the four Shoppin' bullet groups |
| `\shoppinIntro` | Shoppin's opening bullet |

Shoppin's bullets are grouped into `\shoppinAI`, `\shoppinBackend`,
`\shoppinOps` and `\shoppinApp`. **Add a new bullet to the group it belongs
to, not inline**, or it will sit in the same position in every variant.

If you add a macro mid-sentence, write `\macro{}` with the empty braces. TeX
eats the following space otherwise, which is how `real usage.Also ships` once
shipped.

### Adding a fifth variant

1. Copy an `\ifdefstring{\variant}{...}` block in `resume.tex` and override
   only what should differ.
2. Add the name and its published filename to `pdf_name()` in `build.sh`.
3. Add its URL to `redirects` in `../astro.config.mjs`.

Those three are the only places a variant is named.

## The one-page gate

`build.sh` reads the page count out of the pdfLaTeX log and fails the run if a
variant is not exactly one page, publishing nothing. It also reports overfull
lines, which mean text is bleeding past the right margin.

If a variant does spill over, `resume.tex` opens with a ONE-PAGE KNOBS comment
listing which knobs to turn, in order. Trimming a bullet is usually better than
shrinking the font.

## Two traps worth knowing

- **The redirects live in `../astro.config.mjs`, not `vercel.json`.**
  `@astrojs/vercel` writes its own `.vercel/output/config.json` through the
  Build Output API, and that supersedes `redirects`/`rewrites`/`headers` in
  `vercel.json`. Routing added there is silently ignored.
- **Never put `[skip ci]` in the commit message CI pushes.** Vercel reads it as
  "skip this deployment", so the rebuilt PDFs would sit in git without ever
  reaching the live URLs. The workflow's `paths:` filter is what stops it
  retriggering itself.

Vercel sets `Content-Disposition` from the real filename and
`Cache-Control: public, max-age=0, must-revalidate` on static files by itself,
so the download name and freshness need no config. The variant PDFs are
`Disallow`ed for general crawlers in `public/robots.txt`, since four
near-duplicate resumes in a search index help nobody.

## Version history

Every past version is in git, so "what did my resume say when I applied there
in March" is answerable:

```sh
git log --oneline -- public/Mohd_Saif_Resume.pdf
git show <sha>:public/Mohd_Saif_Resume.pdf > /tmp/old-resume.pdf
```
