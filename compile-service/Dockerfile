# A LaTeX compiler for exactly one document.
#
# CI pulls the 2GB full TeX Live, which is why a draft compile there costs ~90
# seconds: the image pull is the whole cost, the pdflatex run is about a second.
# This starts from the basic scheme and adds only the packages resume.tex
# actually loads, which keeps the image small enough that a Cloud Run cold start
# is a few seconds and a warm request is a few hundred milliseconds.
FROM texlive/texlive:latest-basic

# tlmgr resolves dependencies itself, so this list is only what the document
# names directly. Docs and sources are skipped: nothing here reads them.
RUN tlmgr option -- autobackup 0 \
 && tlmgr option docfiles 0 \
 && tlmgr option srcfiles 0 \
 && tlmgr install \
      extsizes \
      preprint \
      titlesec \
      marvosym \
      enumitem \
      etoolbox \
      fancyhdr \
      tools \
      graphics \
      hyperref \
      fontawesome5 \
      babel-english \
 && tlmgr path add

# Node is only the HTTP layer; the image already carries everything else.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Fail the BUILD, not a request at 2am, if a package is missing. This document
# loads exactly what resume.tex loads.
COPY smoke.tex /tmp/smoke/smoke.tex
# NOT smoke.out: hyperref writes its outline to \jobname.out and then reads it
# back, so redirecting stdout there makes pdflatex parse its own console log.
RUN cd /tmp/smoke \
 && pdflatex -interaction=nonstopmode -halt-on-error smoke.tex > smoke.stdout 2>&1 \
    || { echo '--- smoke compile failed ---'; tail -40 smoke.stdout; exit 1; } \
 && test -f smoke.pdf \
 && echo "smoke compile OK" \
 && rm -rf /tmp/smoke

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
