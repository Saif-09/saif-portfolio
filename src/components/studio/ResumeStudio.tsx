/**
 * Resume studio: read, edit, publish and preview every resume variant.
 *
 * The studio does not compile anything. It edits resume/resume.tex, commits it,
 * and watches the build workflow that compiles all four variants and refuses to
 * publish a spilled page. So the preview is always the real published PDF, and
 * "saved" always means "the same gate CI applies has passed".
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
}

const KEY_STORAGE = 'studio:key';

export default function ResumeStudio() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState('');

  const [variants, setVariants] = useState<Variant[]>([]);
  const [tab, setTab] = useState<string>('fullstack');
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
  const [nonce, setNonce] = useState(() => 1);

  const pollRef = useRef<number | null>(null);
  const dirty = tex !== baseTex && baseTex !== '';

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
        const err = new Error(data?.error ?? `Request failed (${res.status})`);
        (err as Error & { status?: number; code?: string }).status = res.status;
        (err as Error & { status?: number; code?: string }).code = data?.code;
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
      setVariants(data.variants ?? []);
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

  /* -------------------------------------------------------------- polling */

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const watchBuild = useCallback(() => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const data = await api('status');
        const next: Run | null = data.run ?? null;
        setRun(next);
        if (next && next.status === 'completed') {
          stopPolling();
          if (next.conclusion === 'success') {
            /* PDFs are rebuilt and deployed: force the previews to refetch. */
            setNonce((n) => n + 1);
          }
        }
      } catch {
        /* a failed poll is not worth surfacing; the next tick may work */
      }
    }, 6000);
  }, [api, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

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
        body: JSON.stringify({ tex, instruction: ask, variant: tab === 'all' ? undefined : tab }),
      });
      setAiResult({
        note: data.note ?? '',
        applied: data.applied ?? [],
        rejected: data.rejected ?? [],
        problems: data.problems ?? [],
        provider: data.provider ?? '',
        changed: Boolean(data.changed),
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
      const e = err as Error & { code?: string };
      setSaveError(e.message);
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
    if (run.status !== 'completed') return { tone: 'busy', text: 'building' };
    if (run.conclusion === 'success') return { tone: 'ok', text: 'published' };
    return { tone: 'bad', text: `build ${run.conclusion ?? 'failed'}` };
  }, [run]);

  if (booting) {
    return <p className="studio-muted">Opening the studio…</p>;
  }

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
          <button type="button" onClick={reload} className="studio-ghost">
            Reload
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="studio-primary">
            {saving ? 'Saving…' : 'Save and publish'}
          </button>
        </div>
      </header>

      {(saveError || saved) && (
        <p className={saveError ? 'studio-error' : 'studio-ok'}>{saveError || saved}</p>
      )}

      <nav className="studio-tabs" aria-label="Resume variant">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className={tab === v.id ? 'is-active' : ''}
            onClick={() => setTab(v.id)}
          >
            {v.label}
          </button>
        ))}
        <button
          type="button"
          className={tab === 'all' ? 'is-active' : ''}
          onClick={() => setTab('all')}
        >
          Compare all
        </button>
      </nav>

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
          {tab === 'all' ? (
            <div className="studio-all">
              {variants.map((v) => (
                <figure key={v.id}>
                  <figcaption>
                    <strong>{v.label}</strong>
                    <a href={v.path} target="_blank" rel="noopener">
                      {v.path}
                    </a>
                  </figcaption>
                  <iframe src={`${v.pdf}?v=${nonce}`} title={`${v.label} resume`} loading="lazy" />
                </figure>
              ))}
            </div>
          ) : (
            active && (
              <>
                <p className="studio-meta">
                  <strong>{active.label}</strong> · {active.leads} ·{' '}
                  <a href={active.path} target="_blank" rel="noopener">
                    open {active.path}
                  </a>
                </p>
                <iframe
                  className="studio-pdf"
                  src={`${active.pdf}?v=${nonce}`}
                  title={`${active.label} resume`}
                />
              </>
            )
          )}
          <p className="studio-muted studio-note">
            This is the published PDF. It updates about a minute after you save, once the build
            finishes.
          </p>
        </section>

        <section className={`studio-col studio-edit ${pane === 'source' ? 'is-shown' : ''}`}>
          <form className="studio-ai" onSubmit={runAi}>
            <label htmlFor="studio-instruction">
              Change it in plain English
              {aiProvider && <span className="studio-muted"> · {aiProvider}</span>}
            </label>
            <textarea
              id="studio-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                tab === 'all'
                  ? 'e.g. add Kotlin to the languages line'
                  : `e.g. make the ${tab} summary lead with real-time systems`
              }
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
