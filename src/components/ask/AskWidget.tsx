import { Fragment, useId, useRef, useState, type FormEvent } from 'react';
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

export default function AskWidget({ t }: { t: AskStrings }) {
  const uid = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const abortRef = useRef<AbortController | null>(null);

  const busy = status === 'loading' || status === 'streaming';

  async function ask(q: string) {
    const trimmed = q.trim().slice(0, MAX_CHARS);
    if (!trimmed || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuestion(trimmed);
    setAnswer('');
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
      setStatus('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        setAnswer(received);
      }
      setStatus(received.trim() ? 'success' : 'error');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setStatus('error');
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <div className="ask-widget">
      <ul className="ask-chips" role="list">
        {t.suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="chip ask-chip"
              disabled={busy}
              onClick={() => void ask(suggestion)}
            >
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
          type="text"
          value={question}
          maxLength={MAX_CHARS}
          placeholder={t.placeholder}
          autoComplete="off"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="form-submit ask-send" disabled={busy || !question.trim()}>
          {busy ? t.thinking : t.send}
        </button>
      </form>

      <div className="ask-answer" aria-live="polite">
        {status === 'loading' && (
          <p className="ask-status" role="status">
            <span className="ask-dots" aria-hidden="true">
              <i /><i /><i />
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
          </div>
        )}
        {status === 'error' && (
          <div className="ask-error-card" role="status">
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5v.01" />
            </svg>
            <div>
              <p>{t.errorText}</p>
              <a href={`mailto:${t.email}`}>{t.errorCta}</a>
            </div>
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
