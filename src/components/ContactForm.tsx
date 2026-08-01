import { useId, useState, type FormEvent } from 'react';

export interface ContactFormStrings {
  name: string;
  email: string;
  message: string;
  send: string;
  sending: string;
  success: string;
  error: string;
  rateLimited: string;
  errors: {
    nameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    messageRequired: string;
    messageShort: string;
  };
}

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'rate-limited';
type Field = 'name' | 'email' | 'message';
type Values = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Real transport (Phase 5) - /api/contact validates, rate-limits, sends. */
async function submitMessage(values: Values & { company: string }): Promise<Status> {
  const res = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (res.status === 429) return 'rate-limited';
  if (!res.ok) return 'error';
  return 'success';
}

export default function ContactForm({ t }: { t: ContactFormStrings }) {
  const uid = useId();
  const [values, setValues] = useState<Values>({ name: '', email: '', message: '' });
  const [honeypot, setHoneypot] = useState('');
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<Status>('idle');

  const validate = (v: Values): FieldErrors => {
    const errors: FieldErrors = {};
    if (!v.name.trim()) errors.name = t.errors.nameRequired;
    if (!v.email.trim()) errors.email = t.errors.emailRequired;
    else if (!EMAIL_RE.test(v.email.trim())) errors.email = t.errors.emailInvalid;
    if (!v.message.trim()) errors.message = t.errors.messageRequired;
    else if (v.message.trim().length < 12) errors.message = t.errors.messageShort;
    return errors;
  };

  const errors = validate(values);
  const shownError = (field: Field) => (touched[field] ? errors[field] : undefined);

  const setValue = (field: Field, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const touch = (field: Field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (Object.keys(errors).length > 0 || status === 'submitting') return;
    setStatus('submitting');
    try {
      const result = await submitMessage({ ...values, company: honeypot });
      setStatus(result);
      if (result === 'success') {
        setValues({ name: '', email: '', message: '' });
        setTouched({});
      }
    } catch {
      setStatus('error');
    }
  };

  const fieldProps = (field: Field) => ({
    id: `${uid}-${field}`,
    name: field,
    value: values[field],
    'aria-invalid': shownError(field) ? true : undefined,
    'aria-describedby': shownError(field) ? `${uid}-${field}-error` : undefined,
    onBlur: () => touch(field),
  });

  const errorText = (field: Field) =>
    shownError(field) ? (
      <p className="form-error" id={`${uid}-${field}-error`}>
        {shownError(field)}
      </p>
    ) : null;

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      {/* Honeypot - visually hidden, ignored by people, filled by bots. */}
      <div className="form-honeypot" aria-hidden="true">
        <label htmlFor={`${uid}-company`}>Company</label>
        <input
          id={`${uid}-company`}
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`${uid}-name`}>{t.name}</label>
          <input
            type="text"
            autoComplete="name"
            {...fieldProps('name')}
            onChange={(e) => setValue('name', e.target.value)}
          />
          {errorText('name')}
        </div>
        <div className="form-field">
          <label htmlFor={`${uid}-email`}>{t.email}</label>
          <input
            type="email"
            autoComplete="email"
            {...fieldProps('email')}
            onChange={(e) => setValue('email', e.target.value)}
          />
          {errorText('email')}
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`${uid}-message`}>{t.message}</label>
        <textarea
          rows={5}
          {...fieldProps('message')}
          onChange={(e) => setValue('message', e.target.value)}
        />
        {errorText('message')}
      </div>
      <div className="form-actions">
        <button className="form-submit" type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? t.sending : t.send}
        </button>
        <p className="form-status" role="status" aria-live="polite">
          {status === 'success'
            ? t.success
            : status === 'error'
              ? t.error
              : status === 'rate-limited'
                ? t.rateLimited
                : ''}
        </p>
      </div>
    </form>
  );
}
