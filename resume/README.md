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

## The studio: saifsiddiqui.in/studio

A private page that does all of this without git. Enter the studio key and you
get, on one screen:

- the live PDF for each variant, plus a **Compare all** view of all four;
- a plain-English box: "add a bullet about X", "make the product summary shorter";
- the raw `resume.tex` if you want to edit it by hand;
- **Save and publish**, which commits and shows the build going green.

It works on a phone. The AI box is the point there: typing an instruction beats
editing LaTeX on a touchscreen.

### How an AI edit stays safe

The model never rewrites the file. It returns find/replace pairs, each of which
must match exactly once, and:

- a `find` that does not match uniquely is **rejected and shown to you**, never
  guessed at, with one automatic retry where the model is shown its own miss;
- the result is structure-checked (variant blocks and the five macros still
  present, braces balanced, no em dash) before it can reach the editor, let
  alone a commit;
- you review the red/green diff and press Save yourself. Nothing auto-commits.
- Save is also gated by that structure check, and then by CI's one-page gate.

Two switches control it, both server-side:

| Env var | What it does |
|---|---|
| `STUDIO_KEY` | The password. **Without it every studio route returns 503 and the tool is off.** |
| `RESUME_GITHUB_TOKEN` | Fine-grained PAT, Contents read/write + Actions read. How the studio reads and commits `resume.tex`. |
| `ANTHROPIC_API_KEY` | Optional. Used for AI edits when present; falls back to `GEMINI_API_KEY`. |

## From the terminal

```sh
npm run resume                        # status: live URLs, last build, local diff
npm run resume -- ai "<instruction>"  # plain-English edit, review, commit
npm run resume -- edit                # open in $EDITOR, then commit
npm run resume -- build               # compile all four locally (Docker or MacTeX)
npm run resume -- push ["message"]    # commit and push as it stands
npm run resume -- open [variant]      # open a published variant
npm run resume -- studio              # open the browser studio
```

`ai` calls the same deployed endpoint the browser uses, so the prompt and the
safety checks live in one place. It needs `STUDIO_KEY` in `.env`; everything
else works on the local checkout with no key.

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
