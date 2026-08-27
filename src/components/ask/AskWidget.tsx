import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { emitTrack } from '../../lib/track/emit';

export interface AskStrings {
  inputLabel: string;
  placeholder: string;
  send: string;
  thinking: string;
  errorText: string;
  errorCta: string;
  email: string;
  rateLimitedText: string;
  suggestions: string[];
}

type Status = 'idle' | 'loading' | 'streaming' | 'success' | 'error' | 'rate-limited';

interface Step {
  id: string;
  label: string;
  status: 'start' | 'done' | 'skip';
  ms?: number;
  detail?: Record<string, unknown>;
}

interface Finished {
  ms: number;
  steps: number;
  citations: { title: string; url: string }[];
  usage?: { input: number; output: number; reasoning?: number };
}

const MAX_CHARS = 300;

/** Linkify internal /work/... and /brain/... paths in the streamed text. */
function renderAnswer(text: string) {
  const parts = text.split(/((?:\/work|\/brain)\/[a-z0-9-]+\/?|\/llms\.txt)/g);
  return parts.map((part, index) =>
    /^(?:\/work|\/brain)\/[a-z0-9-]+\/?$|^\/llms\.txt$/.test(part) ? (
      <a key={index} href={part}>
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/**
 * One line of the pipeline. The summary is what a passer-by reads; the detail
 * underneath is the actual data the stage produced, which is the part worth
 * showing to anyone who wants to know whether this is real.
 */
function StepRow({ step }: { step: Step }) {
  const d = step.detail ?? {};
  const hits = d.hits as { title: string; url: string; score: number }[] | undefined;

  const summary = (() => {
    if (step.id === 'route') {
      const by = d.by === 'own-model' ? `${d.model as string}` : 'keyword heuristic';
      return `${d.label as string} · via ${by}`;
    }
    if (step.id === 'retrieve') {
      if (d.method === 'semantic') {
        return `${d.considered} vectors · ${d.model as string} @ ${d.dims}d`;
      }
      return `keyword fallback${d.reason ? ` · ${d.reason}` : ''}`;
    }
    if (step.id === 'prompt') return `~${d.approxTokens} tokens → ${d.model as string}`;
    if (step.id === 'generate') {
      const fell = d.fellBackFrom as string[] | undefined;
      return `${d.model as string} · ${d.steps} step${d.steps === 1 ? '' : 's'}${
        fell?.length ? ` · after ${fell.join(', ')} declined` : ''
      }`;
    }
    if (step.id.startsWith('tool:')) {
      if (typeof d.count === 'number') return `${d.count} projects returned`;
      if (typeof d.sections === 'number') return `${d.sections} sections, ${d.chars} chars`;
      if (d.found === false) return 'no such page';
      if (hits) return `${hits.length} passages`;
      if (d.area) return `area: ${d.area as string}`;
    }
    return '';
  })();

  return (
    <li className={`ask-step is-${step.status}`}>
      <div className="ask-step-head">
        <span className="ask-step-label">{step.label}</span>
        <span className="ask-step-meta">
          {summary}
          {step.status === 'start' ? (
            <span className="ask-step-live" aria-hidden="true" />
          ) : (
            typeof step.ms === 'number' && <span className="ask-step-ms">{step.ms}ms</span>
          )}
        </span>
      </div>
      {hits && hits.length > 0 && (
        <ul className="ask-hits" role="list">
          {hits.map((hit, index) => (
            <li key={`${hit.url}-${index}`}>
              <span className="ask-hit-score">{hit.score.toFixed(3)}</span>
              <a href={hit.url}>{hit.title}</a>
            </li>
          ))}
        </ul>
      )}
      {typeof d.note === 'string' && <p className="ask-step-note">{d.note}</p>}
    </li>
  );
}

export default function AskWidget({ t }: { t: AskStrings }) {
  const uid = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [steps, setSteps] = useState<Step[]>([]);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [showTrace, setShowTrace] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const busy = status === 'loading' || status === 'streaming';

  /* The classifier runs on a scale-to-zero service, so nudge it awake as soon
     as this widget exists. By the time anyone has typed a question the model is
     loaded, and the trace shows the real thing instead of the fallback. */
  useEffect(() => {
    fetch('/api/ask?warm=1').catch(() => {});
  }, []);

  /** Stages upsert by id so a "start" row becomes its own "done" row. */
  function upsert(step: Step) {
    setSteps((current) => {
      const at = current.findIndex((s) => s.id === step.id);
      if (at === -1) return [...current, step];
      const next = [...current];
      next[at] = step;
      /* Generation encloses the tool calls it makes, so its finished row would
         otherwise sit above tools that ran inside it, reading as though they
         happened afterwards. Move it to the end when it completes. */
      if (step.id === 'generate' && step.status !== 'start' && at !== next.length - 1) {
        next.splice(at, 1);
        next.push(step);
      }
      return next;
    });
  }

  async function ask(q: string) {
    const trimmed = q.trim().slice(0, MAX_CHARS);
    if (!trimmed || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuestion(trimmed);
    setAnswer('');
    setSteps([]);
    setFinished(null);
    setStatus('loading');
    emitTrack('demo_used');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        setStatus('rate-limited');
        return;
      }
      if (!res.ok || !res.body) {
        setStatus('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      /* SSE frames are separated by a blank line and can split across chunks,
         so hold the tail until a full frame has arrived. */
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let event: Record<string, any>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === 'stage') {
            upsert(event as Step);
          } else if (event.type === 'token') {
            setStatus('streaming');
            setAnswer((current) => current + event.text);
          } else if (event.type === 'done') {
            setFinished(event as Finished);
            setStatus('success');
          } else if (event.type === 'error') {
            setStatus('error');
          }
        }
      }

      setStatus((current) => (current === 'streaming' ? 'success' : current));
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setStatus('error');
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = (new FormData(event.target as HTMLFormElement).get('q') as string) ?? '';
    ask(value);
  }

  return (
    <div className="ask-widget">
      <ul className="ask-chips" role="list">
        {t.suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button type="button" onClick={() => ask(suggestion)} disabled={busy}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      <form className="ask-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={`${uid}-q`}>
          {t.inputLabel}
        </label>
        <input
          id={`${uid}-q`}
          name="q"
          type="text"
          placeholder={t.placeholder}
          maxLength={MAX_CHARS}
          defaultValue={question}
          autoComplete="off"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {busy ? t.thinking : t.send}
        </button>
      </form>

      {steps.length > 0 && (
        <div className="ask-trace">
          <button
            type="button"
            className="ask-trace-toggle"
            onClick={() => setShowTrace((v) => !v)}
            aria-expanded={showTrace}
          >
            <span>How it answered</span>
            <span className="ask-trace-summary">
              {finished
                ? `${finished.steps} model step${finished.steps === 1 ? '' : 's'} · ${finished.ms}ms${
                    finished.usage ? ` · ${finished.usage.input + finished.usage.output} tokens` : ''
                  }`
                : 'running'}
            </span>
          </button>
          {showTrace && (
            <ol className="ask-steps" role="list">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="ask-answer" aria-live="polite">
        {status === 'loading' && steps.length === 0 && (
          <p className="ask-status" role="status">
            <span className="ask-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {t.thinking}
          </p>
        )}

        {(status === 'streaming' || status === 'success') && answer && (
          <div className="ask-card">
            <p className="ask-text">
              {renderAnswer(answer)}
              {status === 'streaming' && (
                <span className="ask-caret" aria-hidden="true">
                  ▍
                </span>
              )}
            </p>
            {finished && finished.citations.length > 0 && (
              <ul className="ask-cites" role="list">
                {finished.citations.map((cite) => (
                  <li key={cite.url}>
                    <a href={cite.url}>{cite.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="ask-error-card" role="status">
            <p>{t.errorText}</p>
            <a href={`mailto:${t.email}`}>{t.errorCta}</a>
          </div>
        )}

        {status === 'rate-limited' && (
          <p className="ask-status" role="status">
            {t.rateLimitedText}
          </p>
        )}
      </div>
    </div>
  );
}
