# Resume compile service

A LaTeX compiler for one document, so the studio's draft preview is fast.

## Why it exists

The studio can compile a draft two ways:

Measured on the real resume, end to end from a browser:

| | On-screen variant | All four |
|---|---|---|
| GitHub Actions (the fallback) | ~90s | ~90s |
| This service | **~3.4s** | ~7s |

Almost all of the CI cost is pulling the 2GB full TeX Live image; the pdflatex
run is about a second. This image starts from the basic scheme and adds only the
packages `resume.tex` actually loads.

Where the 3.4s goes: ~0.95s is the compiler itself (two pdflatex passes), and
the rest is the hop out to Vercel, the hop on to Cloud Run, and shipping a
140KB PDF back as base64. So the remaining headroom is in the plumbing, not in
LaTeX.

Publishing does **not** go through here. That stays on CI, triggered by a push to
`main`, so the live resume never depends on this service being up. If the service
is unreachable the studio silently falls back to the CI path; if the service says
the document is broken, it does not fall back, because CI would only reach the
same verdict a minute later.

## Deploying

`gcloud` is already installed and authenticated. The one blocker is that Cloud
Run needs an **open billing account** on the project: usage here sits inside the
always-free tier, but Google requires a card on file regardless. The billing
account on `edwiso-496518` currently reports `OPEN: False`.

Once billing is enabled:

```sh
SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
echo "$SECRET"   # you need this for the Vercel env var below

cd compile-service
gcloud run deploy resume-compile \
  --source . \
  --project edwiso-496518 \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --min-instances 0 --timeout 60 \
  --set-env-vars "COMPILE_SECRET=$SECRET"
```

`asia-south1` deliberately: the Vercel functions calling it run in Mumbai
(`bom1`), so this keeps the round trip in one region.

`--allow-unauthenticated` is safe here because the service does its own check:
every request must carry `x-compile-secret`, and with `COMPILE_SECRET` unset it
rejects everything.

Then point the studio at it:

```sh
export VERCEL_ORG_ID=team_HJWM0TwitxtyDQaRWJ1k4SIT
export VERCEL_PROJECT_ID=prj_kbsfNn5i7REfaiTIMFP2ChoXGdDN
printf '%s' "https://<the URL gcloud printed>" | vercel env add COMPILE_URL production
printf '%s' "$SECRET" | vercel env add COMPILE_SECRET production
```

Redeploy the site and the studio switches over on its own: `Compile` starts
returning PDFs in the same request, and the note under the preview reports the
real time taken instead of warning about the minute.

`--min-instances 0` means it scales to zero, so an idle month costs nothing and
the first compile after a quiet spell pays a cold start. Set `--min-instances 1`
to keep it warm if that ever annoys you.

**`--concurrency 1` matters.** The studio fires two requests at once, one for
the variant on screen and one for the other three. At Cloud Run's default
concurrency both land on the same single-CPU instance and share it, which made
the on-screen preview *slower* (3.4s to 5.5s) even though the total improved.
At concurrency 1 the second request starts a second instance and they genuinely
run in parallel. Compiling is CPU-bound, so multiplexing it on one core buys
nothing.

## What is in the image

`Dockerfile` installs exactly the packages `resume.tex` loads:
`extsizes` (extarticle), `preprint` (fullpage), `titlesec`, `marvosym`,
`enumitem`, `etoolbox`, `fancyhdr`, `tools` (tabularx, verbatim), `graphics`
(color), `hyperref`, `fontawesome5`, `babel-english`. `tlmgr` resolves their
dependencies itself.

`smoke.tex` is compiled **during the build**, loading every one of those
packages. A missing package therefore fails the build rather than a request
later. Keep it in sync with the preamble of `../resume/resume.tex`.

## API

```
GET  /health   -> { ok: true, variants: [...] }
POST /compile  -> { ok: true, pdfs: { "<published filename>": "<base64>" }, ms }
                  headers: x-compile-secret
                  body:    { tex, variants?: ["product", ...] }
```

`422` means the document is at fault, including the one-page rule, and carries
the relevant lines of the LaTeX log. Variants compile sequentially: the container
has one CPU, so four ~250ms runs in a row beat four fighting over it.
