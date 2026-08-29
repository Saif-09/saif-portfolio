/**
 * Apply: a job post becomes a ready-to-send email.
 *
 * A post arrives in three shapes and the panel takes all three, because
 * insisting on a screenshot while you are looking at a careers page on a laptop
 * is exactly the friction that stops a tool being used: drop or paste a
 * screenshot, paste a link, or paste the text.
 *
 * Logging is a separate tap on purpose. A draft you decide against should leave
 * no trace, and a log full of things you never sent is worse than no log.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Extraction {
  company: string;
  role: string;
  location: string;
  employmentType: string;
  yearsAsked: string;
  howToApply: 'email' | 'form' | 'dm' | 'unclear';
  contactEmail: string;
  formUrl: string;
  requiredSubject: string;
  mustHaves: string[];
  postedBy: string;
  deadline: string;
  salary: string;
  notVisible: string[];
  suspicious: boolean;
  suspiciousReason: string;
}

interface Draft {
  subject: string;
  body: string;
  to: string;
  variant: string;
  variantWhy: string;
  resumeUrl?: string;
  suspect?: string[];
}

interface Application {
  id: number;
  appliedOn: string;
  company: string;
  role: string;
  variant: string | null;
  status: string;
  followUpOn: string | null;
}

const KEY_STORAGE = 'studio:key';
const STATUSES = ['drafted', 'sent', 'replied', 'interviewing', 'rejected', 'ghosted'];

export default function ApplyPanel() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'' | 'reading' | 'logging'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [preview, setPreview] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [refused, setRefused] = useState('');

  const [url, setUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [dragging, setDragging] = useState(false);

  const [log, setLog] = useState<Application[]>([]);
  const [overdue, setOverdue] = useState<Application[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    try {
      setKey(window.localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      /* private mode */
    }
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`/api/apply/${path}`, {
        ...init,
        headers: { 'x-studio-key': key, ...(init.headers ?? {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(data?.error ?? `Failed (${res.status})`), {
          data,
          status: res.status,
        });
      }
      return data;
    },
    [key],
  );

  const loadLog = useCallback(async () => {
    if (!key) return;
    try {
      const data = await api('log');
      setLog(data.applications ?? []);
      setOverdue(data.overdue ?? []);
    } catch {
      /* the log is a nicety here; drafting must not depend on it */
    }
  }, [api, key]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  /* -------------------------------------------------------------- intake */

  const receive = useCallback((data: any) => {
    setExtraction(data.extraction);
    if (data.refused) {
      setRefused(data.refused);
    } else if (data.draft) {
      setDraft(data.draft);
      setBody(data.draft.body);
      setSubject(data.draft.subject);
    }
    if (!data.answersLoaded) {
      setNotice('No answers on the server yet. Run `npm run answers` for a fuller draft.');
    }
  }, []);

  const readImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('That is not an image.');
        return;
      }
      setError('');
      setNotice('');
      setRefused('');
      setExtraction(null);
      setDraft(null);
      setBusy('reading');

      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file);
      setPreview(objectUrl.current);

      try {
        /* Raw bytes, not FormData: Astro refuses form content types on
           on-demand routes as CSRF, even same-origin. */
        receive(
          await api('extract', {
            method: 'POST',
            headers: { 'content-type': file.type || 'image/png' },
            body: file,
          }),
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy('');
      }
    },
    [api, receive],
  );

  const readSource = useCallback(
    async (payload: { url?: string; text?: string }) => {
      setError('');
      setNotice('');
      setRefused('');
      setExtraction(null);
      setDraft(null);
      setPreview(null);
      setBusy('reading');
      try {
        receive(
          await api('extract', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy('');
      }
    },
    [api, receive],
  );

  /* Paste a screenshot straight in. On a laptop that is the fastest route:
     no file dialog, no saving to disk first. */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        readImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readImage]);

  /* ------------------------------------------------------------ outbound */

  const mailto = () => {
    if (!draft) return '#';
    /* The address is NOT percent-encoded: encodeURIComponent turns @ into %40
       and some mail clients then open with an empty To field. Filtered to
       characters legal in an address instead, which also closes the
       header-injection route a raw value would open. */
    const to = (draft.to || '').replace(/[^A-Za-z0-9@._%+-]/g, '');
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setNotice('Copied.');
    } catch {
      setError('Could not reach the clipboard.');
    }
  }

  async function logIt(status: 'drafted' | 'sent') {
    if (!extraction) return;
    setBusy('logging');
    setError('');
    try {
      await api('log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company: extraction.company || 'Unknown company',
          role: extraction.role || 'Unknown role',
          source: url ? 'link' : 'screenshot',
          howToApply: extraction.howToApply,
          contact: extraction.contactEmail || extraction.formUrl,
          variant: draft?.variant,
          notes: extraction.requiredSubject
            ? `subject must be: ${extraction.requiredSubject}`
            : null,
          draft: body,
          status,
        }),
      });
      setNotice(status === 'sent' ? 'Logged as sent. Follow-up in 7 days.' : 'Logged.');
      await loadLog();
    } catch (err) {
      const e = err as Error & { status?: number };
      setError(e.status === 409 ? 'Already in the log: you have applied to this one.' : e.message);
    } finally {
      setBusy('');
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      await api('log', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      await loadLog();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startOver() {
    setExtraction(null);
    setDraft(null);
    setPreview(null);
    setError('');
    setNotice('');
    setRefused('');
    setUrl('');
    setPasted('');
  }

  if (!key) {
    return (
      <p className="studio-muted">
        Open the Resume tab and sign in first. This uses the same studio key.
      </p>
    );
  }

  const reading = busy === 'reading';
  const hasResult = Boolean(extraction);

  return (
    <div className="apply">
      {!hasResult && (
        <section className="apply-intake">
          <div
            className={`apply-drop ${dragging ? 'is-dragging' : ''} ${reading ? 'is-busy' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) readImage(file);
            }}
            onClick={() => !reading && fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
            }}
          >
            <p className="apply-drop-title">
              {reading ? 'Reading the post…' : 'Drop a screenshot of the job post'}
            </p>
            <p className="apply-drop-sub">
              {reading
                ? 'Extracting the facts, then drafting.'
                : 'Or paste one, or tap to choose a file'}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readImage(file);
              e.target.value = '';
            }}
            hidden
          />

          <p className="apply-or">or</p>

          <form
            className="apply-url"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) readSource({ url: url.trim() });
            }}
          >
            <label className="sr-only" htmlFor="apply-url">
              Job posting link
            </label>
            <input
              id="apply-url"
              type="url"
              inputMode="url"
              placeholder="Paste a link to the job posting"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={reading}
            />
            <button type="submit" disabled={reading || !url.trim()}>
              Read it
            </button>
          </form>
          <p className="studio-muted apply-hint">
            LinkedIn and Workday block reading their pages directly. Screenshot those.
          </p>

          <details className="apply-paste">
            <summary>Or paste the job text</summary>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Paste the job description here"
              rows={6}
            />
            <button
              type="button"
              onClick={() => pasted.trim() && readSource({ text: pasted.trim() })}
              disabled={reading || !pasted.trim()}
            >
              Read it
            </button>
          </details>
        </section>
      )}

      {(error || notice) && (
        <p className={error ? 'studio-error' : 'studio-ok'}>{error || notice}</p>
      )}

      {hasResult && extraction && (
        <>
          <div className="apply-actions">
            <button type="button" className="studio-ghost" onClick={startOver}>
              New post
            </button>
            {overdue.length > 0 && (
              <span className="apply-overdue">{overdue.length} need a follow-up</span>
            )}
          </div>

          <div className="apply-grid">
            <section className="apply-col">
              {preview && <img className="apply-shot" src={preview} alt="The job post" />}

              <dl className="apply-facts">
                {(
                  [
                    ['Company', extraction.company],
                    ['Role', extraction.role],
                    ['Location', extraction.location],
                    ['They ask for', extraction.yearsAsked && `${extraction.yearsAsked} years`],
                    [
                      'Apply via',
                      extraction.contactEmail || extraction.formUrl || extraction.howToApply,
                    ],
                    ['Subject must be', extraction.requiredSubject],
                    ['Deadline', extraction.deadline],
                    ['Salary', extraction.salary],
                  ] as [string, string][]
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>

              {extraction.notVisible.length > 0 && (
                <p className="studio-muted">
                  Not in the post: {extraction.notVisible.join(', ')}. Nothing was guessed.
                </p>
              )}

              {extraction.mustHaves.length > 0 && (
                <ul className="apply-musts" role="list">
                  {extraction.mustHaves.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="apply-col">
              {refused && <p className="studio-error">Not drafting this one: {refused}</p>}

              {draft && (
                <>
                  <p className="studio-muted">
                    Sending the <strong>{draft.variant}</strong> resume, because {draft.variantWhy}.
                  </p>

                  {draft.suspect && draft.suspect.length > 0 && (
                    <p className="studio-error">
                      Check before sending: the draft mentions{' '}
                      <strong>{draft.suspect.join(', ')}</strong>, which the post asks for but your
                      own material never mentions. Cut it unless it is genuinely true.
                    </p>
                  )}

                  <label className="studio-source-label" htmlFor="apply-subject">
                    Subject
                  </label>
                  <input
                    id="apply-subject"
                    className="apply-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />

                  <label className="studio-source-label" htmlFor="apply-body">
                    To {draft.to || '(no address in the post)'}
                  </label>
                  <textarea
                    id="apply-body"
                    className="apply-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />

                  <div className="apply-send">
                    <a className="apply-primary" href={mailto()}>
                      Open in Mail
                    </a>
                    {draft.resumeUrl && (
                      <a
                        className="apply-download"
                        href={draft.resumeUrl}
                        download={`Mohd_Saif_Resume.pdf`}
                      >
                        Download the {draft.variant} resume
                      </a>
                    )}
                    <button type="button" className="studio-ghost" onClick={copyBody}>
                      Copy
                    </button>
                    <button
                      type="button"
                      className="studio-ghost"
                      onClick={() => logIt('drafted')}
                      disabled={busy !== ''}
                    >
                      Log as drafted
                    </button>
                    <button type="button" onClick={() => logIt('sent')} disabled={busy !== ''}>
                      Log as sent
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}

      {log.length > 0 && (
        <section className="apply-log">
          <h2>Applications</h2>
          <ul role="list">
            {log.map((row) => {
              const isOverdue = overdue.some((o) => o.id === row.id);
              return (
                <li key={row.id} className={isOverdue ? 'is-overdue' : ''}>
                  <span className="apply-log-when">{row.appliedOn}</span>
                  <span className="apply-log-what">
                    <strong>{row.company}</strong> · {row.role}
                    {row.variant && <span className="studio-muted"> · {row.variant}</span>}
                  </span>
                  {isOverdue && <span className="apply-overdue">follow up</span>}
                  <select
                    value={row.status}
                    onChange={(e) => setStatus(row.id, e.target.value)}
                    aria-label={`Status for ${row.company}`}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
