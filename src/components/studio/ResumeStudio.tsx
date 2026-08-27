/**
 * Resume studio: read, edit, compile, publish and preview every resume variant.
 *
 * Two previews, deliberately distinguished, because confusing them would be
 * worse than not having one:
 *   - Published: the PDF live on the site right now.
 *   - Draft: the editor's current source, compiled without publishing.
 *
 * The draft compile is the same compiler and the same one-page gate that decide
 * what gets published, so a draft that would spill onto page 2 fails here first.
 * It resolves one of two ways, and the UI reports which rather than pretending
 * they are the same: the compile service answers inside the request in a few
 * hundred milliseconds, or, when that is not configured, CI builds it in about a
 * minute behind a running clock.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Variant {
  id: string;
  label: string;
  path: string;
  pdf: string;
  leads: string;
}

interface Run {
  id: number | null;
  status: string | null;
  conclusion: string | null;
  url: string | null;
  startedAt: string | null;
  title: string | null;
}

interface AiResult {
  note: string;
  applied: { why: string; find: string; replace: string }[];
  rejected: { reason: string; find: string }[];
  problems: string[];
  provider: string;
  changed: boolean;
  retried: boolean;
}

type CompileState = 'idle' | 'queued' | 'building' | 'ready' | 'failed';

const KEY_STORAGE = 'studio:key';
const AUTO_STORAGE = 'studio:autocompile';

/** Hide the built-in PDF chrome so a preview reads as a page, not a viewer. */
const PDF_VIEW = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';

/** Long enough that it fires when you stop working, not between words. */
const AUTO_COMPILE_IDLE_MS = 45_000;

export default function ResumeStudio() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState('');

  const [variants, setVariants] = useState<Variant[]>([]);
  const [tab, setTab] = useState<string>('');
  const [pane, setPane] = useState<'preview' | 'source'>('preview');

  const [tex, setTex] = useState('');
  const [baseTex, setBaseTex] = useState('');
  const [sha, setSha] = useState('');
  const [undoTex, setUndoTex] = useState<string | null>(null);

  const [run, setRun] = useState<Run | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const [instruction, setInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiError, setAiError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState('');
  const [nonce, setNonce] = useState(1);

  /* draft compile */
  const [compileState, setCompileState] = useState<CompileState>('idle');
  const [compileError, setCompileError] = useState('');
  const [compileRun, setCompileRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [compileMs, setCompileMs] = useState<number | null>(null);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [draftOf, setDraftOf] = useState<string | null>(null);
  const [source, setSource] = useState<'published' | 'draft'>('published');
  const [autoCompile, setAutoCompile] = useState(false);

  const buildPoll = useRef<number | null>(null);
  const compilePoll = useRef<number | null>(null);
  const clock = useRef<number | null>(null);
  const autoTimer = useRef<number | null>(null);
  const blobs = useRef<string[]>([]);

  const dirty = tex !== baseTex && baseTex !== '';
  const draftIsCurrent = draftOf !== null && draftOf === tex;

  const api = useCallback(
    async (path: string, init: RequestInit = {}, useKey?: string) => {
      const res = await fetch(`/api/studio/${path}`, {
        ...init,
        headers: {
          'x-studio-key': useKey ?? key,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error ?? `Request failed (${res.status})`) as Error & {
          status?: number;
          code?: string;
        };
        err.status = res.status;
        err.code = data?.code;
        throw err;
      }
      return data;
    },
    [key],
  );

  /* ------------------------------------------------------------------ load */

  const load = useCallback(
    async (useKey: string) => {
      const data = await api('source', {}, useKey);
      const list: Variant[] = data.variants ?? [];
      setVariants(list);
      setTab((current) => current || list[0]?.id || '');
      setTex(data.tex ?? '');
      setBaseTex(data.tex ?? '');
      setSha(data.sha ?? '');
      setRun(data.run ?? null);
      setAiProvider(data.ai?.provider ?? null);
      setUndoTex(null);
    },
    [api],
  );

  useEffect(() => {
    let stored = '';
    try {
      stored = window.localStorage.getItem(KEY_STORAGE) ?? '';
      setAutoCompile(window.localStorage.getItem(AUTO_STORAGE) === '1');
    } catch {
      /* private mode */
    }
    if (!stored) {
      setBooting(false);
      return;
    }
    setKey(stored);
    load(stored)
      .then(() => setAuthed(true))
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401) {
          try {
            window.localStorage.removeItem(KEY_STORAGE);
          } catch {
            /* ignore */
          }
        } else {
          setFatal(err.message);
        }
      })
      .finally(() => setBooting(false));
  }, [load]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setFatal('');
    const candidate = keyInput.trim();
    if (!candidate) return;
    try {
      await load(candidate);
      setKey(candidate);
      setAuthed(true);
      try {
        window.localStorage.setItem(KEY_STORAGE, candidate);
      } catch {
        /* private mode: the key just will not persist */
      }
    } catch (err) {
      setFatal(err instanceof Error ? err.message : 'Could not sign in.');
    }
  }

  /* Warn before losing an unsaved edit. */
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  /* Blob URLs outlive React state unless revoked explicitly. */
  useEffect(
    () => () => {
      blobs.current.forEach((url) => URL.revokeObjectURL(url));
      [buildPoll, compilePoll, clock, autoTimer].forEach((ref) => {
        if (ref.current !== null) window.clearInterval(ref.current);
      });
    },
    [],
  );

  /* --------------------------------------------------- published build poll */

  const watchBuild = useCallback(() => {
    if (buildPoll.current !== null) window.clearInterval(buildPoll.current);
    buildPoll.current = window.setInterval(async () => {
      try {
        const data = await api('status');
        const next: Run | null = data.run ?? null;
        setRun(next);
        if (next && next.status === 'completed') {
          window.clearInterval(buildPoll.current!);
          buildPoll.current = null;
          if (next.conclusion === 'success') {
            setNonce((n) => n + 1);
            setSource('published');
          }
        }
      } catch {
        /* a failed poll is not worth surfacing; the next tick may work */
      }
    }, 6000);
  }, [api]);

  /* ---------------------------------------------------------- draft compile */

  /** Replace the draft with a new set of blob URLs, revoking the old ones. */
  const adoptDraft = useCallback((next: Record<string, string>, forTex: string) => {
    setDraftUrls((old) => {
      Object.values(old).forEach((url) => URL.revokeObjectURL(url));
      blobs.current = blobs.current.filter((u) => !Object.values(old).includes(u));
      return next;
    });
    setDraftOf(forTex);
    setSource('draft');
  }, []);

  /** base64 straight from the compile service, keyed by published filename. */
  const adoptInstant = useCallback(
    (pdfs: Record<string, string>, list: Variant[], forTex: string) => {
      const next: Record<string, string> = {};
      for (const v of list) {
        const b64 = pdfs[v.pdf.replace(/^\//, '')];
        if (!b64) continue;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        blobs.current.push(url);
        next[v.id] = url;
      }
      if (Object.keys(next).length === 0) return false;
      adoptDraft(next, forTex);
      return true;
    },
    [adoptDraft],
  );

  const fetchDraftPdfs = useCallback(
    async (list: Variant[], forTex: string) => {
      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (v) => {
          try {
            const res = await fetch(`/api/studio/preview?variant=${v.id}`, {
              headers: { 'x-studio-key': key },
            });
            if (!res.ok) return;
            const url = URL.createObjectURL(await res.blob());
            blobs.current.push(url);
            next[v.id] = url;
          } catch {
            /* one missing variant should not lose the others */
          }
        }),
      );
      if (Object.keys(next).length === 0) return false;
      adoptDraft(next, forTex);
      return true;
    },
    [key, adoptDraft],
  );

  const startCompile = useCallback(
    async (which: string) => {
      if (compileState === 'queued' || compileState === 'building') return;

      setCompileError('');
      setCompileState('queued');
      setElapsed(0);

      if (clock.current !== null) window.clearInterval(clock.current);
      clock.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

      const stop = (state: CompileState, message?: string) => {
        setCompileState(state);
        if (message) setCompileError(message);
        if (clock.current !== null) {
          window.clearInterval(clock.current);
          clock.current = null;
        }
        if (compilePoll.current !== null) {
          window.clearInterval(compilePoll.current);
          compilePoll.current = null;
        }
      };

      let commitSha = '';
      try {
        const started = await api('compile', {
          method: 'POST',
          body: JSON.stringify({ tex: which }),
        });

        /* The compile service answered in this request: nothing to poll. */
        if (started.mode === 'instant' && started.pdfs) {
          if (adoptInstant(started.pdfs, variants, which)) {
            setCompileMs(started.ms ?? null);
            stop('ready');
          } else {
            stop('failed', 'The compile returned no readable PDFs.');
          }
          return;
        }

        setCompileMs(null);
        commitSha = started.commitSha ?? '';
      } catch (err) {
        stop('failed', err instanceof Error ? err.message : 'Could not start the compile.');
        return;
      }

      if (compilePoll.current !== null) window.clearInterval(compilePoll.current);
      compilePoll.current = window.setInterval(async () => {
        try {
          const data = await api(`compile?commit=${encodeURIComponent(commitSha)}`);
          setCompileRun(data.run ?? null);
          if (data.state === 'building') setCompileState('building');
          if (data.state === 'ready') {
            stop('ready');
            const got = await fetchDraftPdfs(variants, which);
            if (!got) {
              setCompileState('failed');
              setCompileError('The compile finished but the PDFs could not be read.');
            }
          }
          if (data.state === 'failed') {
            stop(
              'failed',
              'The compile failed. Usually that means a variant no longer fits on one page.',
            );
          }
        } catch {
          /* transient; the next tick may work */
        }
      }, 6000);
    },
    [api, compileState, fetchDraftPdfs, adoptInstant, variants],
  );

  /* Auto compile: fires once you stop working, not while you type. */
  useEffect(() => {
    if (!autoCompile || !authed) return;
    if (draftIsCurrent) return;
    if (compileState === 'queued' || compileState === 'building') return;

    if (autoTimer.current !== null) window.clearTimeout(autoTimer.current);
    autoTimer.current = window.setTimeout(() => startCompile(tex), AUTO_COMPILE_IDLE_MS);

    return () => {
      if (autoTimer.current !== null) window.clearTimeout(autoTimer.current);
    };
    /* startCompile is intentionally omitted: it changes identity on every
       compileState transition, which would re-arm the timer mid-compile. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCompile, authed, tex, draftIsCurrent, compileState]);

  function toggleAuto() {
    const next = !autoCompile;
    setAutoCompile(next);
    try {
      window.localStorage.setItem(AUTO_STORAGE, next ? '1' : '0');
    } catch {
      /* private mode */
    }
  }

  /* ------------------------------------------------------------------- ai */

  async function runAi(event: React.FormEvent) {
    event.preventDefault();
    const ask = instruction.trim();
    if (!ask || aiBusy) return;

    setAiBusy(true);
    setAiError('');
    setAiResult(null);
    const before = tex;

    try {
      const data = await api('ai', {
        method: 'POST',
        body: JSON.stringify({ tex, instruction: ask, variant: tab }),
      });
      setAiResult({
        note: data.note ?? '',
        applied: data.applied ?? [],
        rejected: data.rejected ?? [],
        problems: data.problems ?? [],
        provider: data.provider ?? '',
        changed: Boolean(data.changed),
        retried: Boolean(data.retried),
      });
      if (data.changed && typeof data.tex === 'string') {
        setUndoTex(before);
        setTex(data.tex);
        setInstruction('');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'The AI edit failed.');
    } finally {
      setAiBusy(false);
    }
  }

  function undo() {
    if (undoTex === null) return;
    setTex(undoTex);
    setUndoTex(null);
    setAiResult(null);
  }

  /* ----------------------------------------------------------------- save */

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError('');
    setSaved('');
    try {
      const data = await api('save', {
        method: 'POST',
        body: JSON.stringify({
          tex,
          sha,
          message: aiResult?.note
            ? `Update resume: ${aiResult.note.slice(0, 90)}`
            : 'Update resume from the studio',
        }),
      });
      setSha(data.sha ?? sha);
      setBaseTex(tex);
      setUndoTex(null);
      setSaved('Committed. Building all four variants now.');
      watchBuild();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    if (dirty && !window.confirm('Discard your unsaved changes and reload from GitHub?')) return;
    try {
      await load(key);
      setSaveError('');
      setSaved('');
      setAiResult(null);
      setNonce((n) => n + 1);
      setSource('published');
    } catch (err) {
      setFatal(err instanceof Error ? err.message : 'Reload failed.');
    }
  }

  /* --------------------------------------------------------------- render */

  const active = useMemo(
    () => variants.find((v) => v.id === tab) ?? variants[0],
    [variants, tab],
  );

  const status = useMemo(() => {
    if (!run || !run.status) return { tone: 'idle', text: 'no builds yet' };
    if (run.status !== 'completed') return { tone: 'busy', text: 'publishing' };
    if (run.conclusion === 'success') return { tone: 'ok', text: 'published' };
    return { tone: 'bad', text: `build ${run.conclusion ?? 'failed'}` };
  }, [run]);

  /** Which PDF a given variant should show, honouring the source switch. */
  const srcFor = useCallback(
    (v: Variant) =>
      source === 'draft' && draftUrls[v.id]
        ? `${draftUrls[v.id]}${PDF_VIEW}`
        : `${v.pdf}?v=${nonce}${PDF_VIEW}`,
    [source, draftUrls, nonce],
  );

  if (booting) return <p className="studio-muted">Opening the studio…</p>;

  if (!authed) {
    return (
      <form className="studio-gate" onSubmit={signIn}>
        <h2>Resume studio</h2>
        <p className="studio-muted">
          Edit and publish the resume. Enter the studio key to continue.
        </p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Studio key"
          autoComplete="current-password"
          aria-label="Studio key"
        />
        <button type="submit">Open</button>
        {fatal && <p className="studio-error">{fatal}</p>}
      </form>
    );
  }

  const compiling = compileState === 'queued' || compileState === 'building';
  const hasDraft = Object.keys(draftUrls).length > 0;

  return (
    <div className="studio">
      <header className="studio-head">
        <div className="studio-head-left">
          <h1>Resume studio</h1>
          <span className={`studio-pill studio-pill-${status.tone}`}>
            {status.text}
            {run?.url && status.tone === 'bad' && (
              <>
                {' '}
                <a href={run.url} target="_blank" rel="noopener">
                  log
                </a>
              </>
            )}
          </span>
        </div>
        <div className="studio-head-right">
          {dirty && <span className="studio-dirty">unsaved</span>}
          <button
            type="button"
            onClick={() => startCompile(tex)}
            disabled={compiling || draftIsCurrent}
            className="studio-ghost"
            title={
              draftIsCurrent
                ? 'The draft preview already matches the editor'
                : 'Compile without publishing'
            }
          >
            {compiling ? `Compiling ${elapsed}s` : draftIsCurrent ? 'Compiled' : 'Compile'}
          </button>
          <button type="button" onClick={reload} className="studio-ghost">
            Reload
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="studio-primary"
          >
            {saving ? 'Saving…' : 'Save and publish'}
          </button>
        </div>
      </header>

      {(saveError || saved) && (
        <p className={saveError ? 'studio-error' : 'studio-ok'}>{saveError || saved}</p>
      )}
      {compileError && (
        <p className="studio-error">
          {compileError}
          {compileRun?.url && (
            <>
              {' '}
              <a href={compileRun.url} target="_blank" rel="noopener">
                see the log
              </a>
            </>
          )}
        </p>
      )}

      <div className="studio-panetabs" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'preview'}
          className={pane === 'preview' ? 'is-active' : ''}
          onClick={() => setPane('preview')}
        >
          Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'source'}
          className={pane === 'source' ? 'is-active' : ''}
          onClick={() => setPane('source')}
        >
          Edit
        </button>
      </div>

      <div className="studio-grid">
        <section className={`studio-col studio-preview ${pane === 'preview' ? 'is-shown' : ''}`}>
          <div className="studio-sourcebar">
            <div className="studio-switch" role="group" aria-label="Which version to show">
              <button
                type="button"
                className={source === 'published' ? 'is-active' : ''}
                onClick={() => setSource('published')}
              >
                Published
              </button>
              <button
                type="button"
                className={source === 'draft' ? 'is-active' : ''}
                onClick={() => setSource('draft')}
                disabled={!hasDraft}
                title={hasDraft ? '' : 'Compile first'}
              >
                Draft
              </button>
            </div>
            <label className="studio-auto">
              <input type="checkbox" checked={autoCompile} onChange={toggleAuto} />
              Auto compile
            </label>
          </div>

          {source === 'draft' && !draftIsCurrent && (
            <p className="studio-stale">
              This draft is older than what is in the editor. Compile again to refresh it.
            </p>
          )}

          {active && (
            <>
              <p className="studio-meta">
                <strong>{active.label}</strong> · {active.leads} ·{' '}
                <a href={active.path} target="_blank" rel="noopener">
                  open {active.path}
                </a>
              </p>
              <iframe
                className="studio-pdf"
                src={srcFor(active)}
                title={`${active.label} resume, ${source}`}
              />
            </>
          )}

          {/* All four at a glance. Clicking one makes it the big preview. */}
          <div className="studio-thumbs">
            {variants.map((v) => (
              <button
                type="button"
                key={v.id}
                className={`studio-thumb ${tab === v.id ? 'is-active' : ''}`}
                onClick={() => setTab(v.id)}
                aria-pressed={tab === v.id}
              >
                <iframe src={srcFor(v)} title={`${v.label} thumbnail`} tabIndex={-1} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>

          <p className="studio-muted studio-note">
            {source === 'draft'
              ? 'Draft: your editor contents, compiled but not published.'
              : 'Published: what the live URLs serve right now.'}{' '}
            {compileMs !== null
              ? ` Compiled in ${(compileMs / 1000).toFixed(1)}s.`
              : ' A compile takes about a minute unless the compile service is wired up.'}{' '}
            It fails if a variant no longer fits one page.
          </p>
        </section>

        <section className={`studio-col studio-edit ${pane === 'source' ? 'is-shown' : ''}`}>
          <form className="studio-ai" onSubmit={runAi}>
            <label htmlFor="studio-instruction">
              Change the {active?.label ?? ''} resume in plain English
              {aiProvider && <span className="studio-muted"> · {aiProvider}</span>}
            </label>
            <textarea
              id="studio-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={`e.g. make the ${active?.label.toLowerCase() ?? ''} summary lead with real-time systems`}
              rows={3}
              disabled={aiBusy || !aiProvider}
            />
            <div className="studio-ai-actions">
              <button type="submit" disabled={aiBusy || !instruction.trim() || !aiProvider}>
                {aiBusy ? 'Thinking…' : 'Apply with AI'}
              </button>
              {undoTex !== null && (
                <button type="button" className="studio-ghost" onClick={undo}>
                  Undo
                </button>
              )}
            </div>
            {!aiProvider && (
              <p className="studio-muted">
                No AI key is set on the server, so this box is off. Editing below still works.
              </p>
            )}
            {aiError && <p className="studio-error">{aiError}</p>}
          </form>

          {aiResult && (
            <div className="studio-result">
              {aiResult.note && <p className="studio-result-note">{aiResult.note}</p>}
              {aiResult.problems.length > 0 && (
                <p className="studio-error">
                  Not applied, it would have broken the file: {aiResult.problems.join('; ')}.
                </p>
              )}
              {aiResult.applied.length > 0 && (
                <details open>
                  <summary>
                    {aiResult.applied.length} change{aiResult.applied.length > 1 ? 's' : ''} applied
                  </summary>
                  <ul>
                    {aiResult.applied.map((e, i) => (
                      <li key={i}>
                        {e.why && <p>{e.why}</p>}
                        <pre className="studio-del">{e.find}</pre>
                        <pre className="studio-ins">{e.replace || '(removed)'}</pre>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {aiResult.rejected.length > 0 && (
                <details>
                  <summary>{aiResult.rejected.length} skipped</summary>
                  <ul>
                    {aiResult.rejected.map((r, i) => (
                      <li key={i}>
                        <p>{r.reason}</p>
                        <pre>{r.find}</pre>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <label htmlFor="studio-source" className="studio-source-label">
            resume.tex
            <span className="studio-muted"> · {tex.length.toLocaleString()} characters</span>
          </label>
          <textarea
            id="studio-source"
            className="studio-source"
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            spellCheck={false}
            wrap="off"
          />
        </section>
      </div>
    </div>
  );
}
