/**
 * Every value a job application ever asks for, one tap from the clipboard.
 *
 * This exists because of how applying actually goes on a phone: you are inside
 * someone's form, it wants your LinkedIn URL, and you leave to go and find it.
 * Digging it out of a profile page, an email signature or the resume PDF is the
 * friction that turns a two-minute application into a tomorrow one.
 *
 * The links come from src/data/profile.ts, which the whole site already reads
 * from, so they are here even when the server has no answers stored. Everything
 * else comes from answers.yml, which is where facts the site does not publish
 * belong: the phone number, the notice period, the expected salary.
 */
import { useCallback, useState } from 'react';
import { profile } from '../../data/profile';

interface Row {
  label: string;
  value: string;
  /** Paragraph answers get a wrapped block instead of one clipped line. */
  long?: boolean;
}

interface Group {
  title: string;
  rows: Row[];
}

const SITE = new URL(profile.resumeUrl).origin;

/** The four live variants, in the order the skill ranks them. */
const RESUME_FALLBACK: Record<string, string> = {
  product: `${SITE}/resume`,
  mobile: `${SITE}/resume/mobile`,
  ai: `${SITE}/resume/ai`,
  fullstack: `${SITE}/resume/fullstack`,
};

const LOGISTICS: [string, string][] = [
  ['notice_period', 'Notice period'],
  ['earliest_start', 'Earliest start'],
  ['expected_ctc', 'Expected CTC'],
  ['current_ctc', 'Current CTC'],
  ['willing_to_relocate', 'Relocation'],
  ['preferred_locations', 'Preferred locations'],
  ['work_authorisation', 'Work authorisation'],
  ['open_to', 'Open to'],
];

const PARAGRAPHS: [string, string][] = [
  ['positioning', 'Positioning'],
  ['why_me_product', 'Why me: product'],
  ['why_me_mobile', 'Why me: mobile'],
  ['why_me_ai', 'Why me: AI'],
  ['why_me_fullstack', 'Why me: full stack'],
];

/** Blank, or a placeholder nobody should ever paste into a form. */
function real(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'TODO';
}

function titleise(key: string): string {
  const words = key.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function CopyDetails({ answers }: { answers: Record<string, any> | null }) {
  const [copied, setCopied] = useState('');
  const [failed, setFailed] = useState(false);

  const copy = useCallback(async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* Safari refuses the async clipboard in some contexts. The old way still
         works there, and a copy button that silently does nothing is worse
         than a deprecated API. */
      try {
        const box = document.createElement('textarea');
        box.value = value;
        box.setAttribute('readonly', '');
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        document.execCommand('copy');
        box.remove();
      } catch {
        setFailed(true);
        return;
      }
    }
    setFailed(false);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? '' : current)), 1500);
  }, []);

  const identity = (answers?.identity ?? {}) as Record<string, string>;
  const logistics = (answers?.logistics ?? {}) as Record<string, string>;
  const resumes = (answers?.resume ?? {}) as Record<string, string>;
  const links = (answers?.links ?? {}) as Record<string, string>;
  const paragraphs = (answers?.paragraphs ?? {}) as Record<string, string>;

  const name = real(identity.full_name) ? identity.full_name : profile.name;
  const email = real(identity.email) ? identity.email : profile.email;
  const linkedin = real(identity.linkedin) ? identity.linkedin : profile.linkedin;
  const github = real(identity.github) ? identity.github : profile.github;
  const portfolio = real(identity.portfolio) ? identity.portfolio : SITE;

  const groups: Group[] = [];

  groups.push({
    title: 'You',
    rows: [
      { label: 'Full name', value: name },
      { label: 'Email', value: email },
      ...(real(identity.phone) ? [{ label: 'Phone', value: identity.phone }] : []),
      ...(real(identity.location) ? [{ label: 'Location', value: identity.location }] : []),
      { label: 'Portfolio', value: portfolio },
      { label: 'LinkedIn', value: linkedin },
      { label: 'GitHub', value: github },
    ],
  });

  const resumeRows = Object.entries({ ...RESUME_FALLBACK, ...resumes })
    .filter(([, value]) => real(value))
    .map(([id, value]) => ({ label: titleise(id), value }));
  if (resumeRows.length) groups.push({ title: 'Resume links', rows: resumeRows });

  const proofRows = Object.entries(links)
    .filter(([, value]) => real(value))
    .map(([id, value]) => ({ label: titleise(id), value }));
  if (proofRows.length) groups.push({ title: 'Proof links', rows: proofRows });

  const logisticsRows = LOGISTICS.filter(([id]) => real(logistics[id])).map(([id, label]) => ({
    label,
    value: logistics[id].trim(),
    long: logistics[id].trim().length > 60,
  }));
  if (logisticsRows.length) groups.push({ title: 'Logistics', rows: logisticsRows });

  const known = new Set(PARAGRAPHS.map(([id]) => id));
  const paragraphRows = [
    ...PARAGRAPHS.filter(([id]) => real(paragraphs[id])).map(([id, label]) => ({
      label,
      value: paragraphs[id].trim(),
      long: true,
    })),
    ...Object.entries(paragraphs)
      .filter(([id, value]) => !known.has(id) && real(value))
      .map(([id, value]) => ({ label: titleise(id), value: value.trim(), long: true })),
  ];
  if (paragraphRows.length) groups.push({ title: 'Long answers', rows: paragraphRows });

  /* What a form's contact section wants, in one go. */
  const block = [
    name,
    email,
    real(identity.phone) ? identity.phone : '',
    portfolio,
    linkedin,
    github,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <details className="apply-details">
      <summary>
        Your details
        <span className="studio-muted"> · name, links, notice period, salary</span>
      </summary>

      <div className="apply-detailsbody">
        <button type="button" className="apply-copyall" onClick={() => copy('block', block)}>
          {copied === 'block' ? 'Copied the contact block' : 'Copy the whole contact block'}
        </button>

        {!answers && (
          <p className="studio-muted">
            Only the public links are here. Run <code>npm run answers</code> to put the phone
            number, notice period and salary on the server too.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.title} className="apply-copygroup">
            <h4>{group.title}</h4>
            {group.rows.map((row) => {
              const id = `${group.title}:${row.label}`;
              return (
                <div key={id} className={`apply-copyrow ${row.long ? 'is-long' : ''}`}>
                  <span className="apply-copylabel">{row.label}</span>
                  <span className="apply-copyvalue">{row.value}</span>
                  <button type="button" onClick={() => copy(id, row.value)}>
                    {copied === id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              );
            })}
          </section>
        ))}

        {failed && (
          <p className="studio-error">
            This browser would not let the page write to the clipboard. Select the value and copy
            it by hand.
          </p>
        )}
      </div>
    </details>
  );
}
