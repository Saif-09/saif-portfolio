# Resume source

`resume.tex` is the source of truth. `public/Mohd_Saif_Resume.pdf` is generated from it.

## The live URL

- `https://saifsiddiqui.in/resume` : the link to give out. 307s to `/Mohd_Saif_Resume.pdf`.
- Saves to disk as `Mohd_Saif_Resume.pdf` (set via `Content-Disposition` in `vercel.json`), not `resume.pdf`.
- `Cache-Control: public, max-age=0, must-revalidate`, so a recruiter who opened the link last month gets the current file, not a cached one. Vercel sets this (and the `Content-Disposition` filename) automatically for static files; no config needed.
- `/cv` works too, and so does the older `/resume.pdf`.

The URL never changes when the resume does, which is the whole point: a link
already sent to ten people keeps resolving to the latest version.

## Editing it

Edit `resume.tex` and push to `main`. The `Build resume PDF` workflow compiles
it with pdfLaTeX, commits `public/Mohd_Saif_Resume.pdf`, and Vercel deploys. No local
LaTeX install needed, so github.dev from a phone is a fine way to do it.

Only a change to `resume.tex` triggers the workflow. The PDF commit it makes
cannot retrigger it, which is why that commit message must NOT contain
`[skip ci]`: Vercel reads that as "skip this deployment" and the rebuilt PDF
would sit in git without ever reaching the live URL.

The redirects live in `astro.config.mjs`, not `vercel.json`. `@astrojs/vercel`
writes its own `.vercel/output/config.json` through the Build Output API, and
that supersedes `redirects`/`rewrites`/`headers` in `vercel.json`.

## Compiling locally (optional)

Needs a TeX distribution with `fontawesome5`, `extarticle` and `glyphtounicode`
(MacTeX, or `brew install --cask mactex-no-gui`):

```sh
cd resume && latexmk -pdf resume.tex && mv resume.pdf ../public/Mohd_Saif_Resume.pdf
```

## Keeping it to one page

`resume.tex` opens with a ONE-PAGE KNOBS comment block listing which knobs to
turn, in order, if the content ever spills onto a second page.

## Version history

Every past version is in git history, so "what did my resume say when I applied
there in March" is answerable:

```sh
git log --oneline -- public/Mohd_Saif_Resume.pdf
git show <sha>:public/Mohd_Saif_Resume.pdf > /tmp/old-resume.pdf
```
