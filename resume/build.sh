#!/usr/bin/env bash
# Build every resume variant from resume.tex and refuse to ship a 2-page PDF.
#
#   ./build.sh              build all variants
#   ./build.sh mobile       build just one
#
# Output: out/<recruiter-facing name>.pdf, which the workflow copies straight
# into ../public/ so each one deploys at its own URL. The names are what a
# recruiter sees in their downloads folder, so they carry the full name.

set -euo pipefail

cd "$(dirname "$0")"

SRC="resume.tex"
OUTDIR="out"
VARIANTS=("fullstack" "mobile" "ai" "product")
[ $# -gt 0 ] && VARIANTS=("$@")

# variant -> published filename. Keep in sync with the redirects in
# ../astro.config.mjs; nothing else maps these two together.
pdf_name() {
  case "$1" in
    fullstack) echo "Mohd_Saif_Resume.pdf" ;;
    mobile)    echo "Mohd_Saif_Resume_Mobile.pdf" ;;
    ai)        echo "Mohd_Saif_Resume_AI.pdf" ;;
    product)   echo "Mohd_Saif_Resume_Product.pdf" ;;
    *)         echo "" ;;
  esac
}

command -v pdflatex >/dev/null || { echo "pdflatex not found"; exit 1; }
[ -f "$SRC" ] || { echo "$SRC not found"; exit 1; }

mkdir -p "$OUTDIR" .build
fail=0

for v in "${VARIANTS[@]}"; do
  out_name="$(pdf_name "$v")"
  if [ -z "$out_name" ]; then
    echo "unknown variant: $v (valid: fullstack mobile ai product)"
    fail=1
    continue
  fi

  job="resume-$v"
  printf '%-34s' "building $v -> $out_name"

  # Two passes so hyperref settles. Build artifacts stay out of the repo root.
  ok=1
  for _ in 1 2; do
    pdflatex -interaction=nonstopmode -halt-on-error \
             -output-directory=.build -jobname="$job" \
             "\def\variant{$v}\input{$SRC}" > ".build/$job.stdout" 2>&1 \
      || { echo "COMPILE FAILED, see resume/.build/$job.stdout"; ok=0; fail=1; break; }
  done
  [ "$ok" = "1" ] || continue

  # --- one-page gate ---
  # pdflatex itself reports the count ("Output written on x.pdf (1 page, ...)").
  # Read that rather than pdfinfo: no poppler dependency, and counting
  # "/Type /Page" in the file fails outright once the page tree is inside a
  # compressed object stream, which it is here.
  pages=$(sed -n 's/.*Output written on .*(\([0-9]\{1,\}\) page.*/\1/p' ".build/$job.log" | tail -1)

  if [ "${pages:-}" != "1" ]; then
    echo "FAIL: ${pages:-unknown} pages, must be 1"
    fail=1
    continue
  fi

  # --- overfull line warning (text bleeding past the right margin) ---
  over=$(grep -c "Overfull \\\\hbox" ".build/$job.log" || true)
  if [ "$over" != "0" ]; then
    printf 'ok (1 page) - warning: %s overfull line(s)\n' "$over"
  else
    echo "ok (1 page)"
  fi

  cp ".build/$job.pdf" "$OUTDIR/$out_name"
done

if [ "$fail" != "0" ]; then
  echo
  echo "One or more variants failed the checks above. Nothing was published."
  exit 1
fi

echo
echo "All variants passed. PDFs in resume/$OUTDIR/:"
ls -1 "$OUTDIR"
