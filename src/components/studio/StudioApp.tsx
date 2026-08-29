/**
 * The studio has two jobs now, so it needs a way to switch between them.
 *
 * Each panel handles its own key: the resume studio owns the sign-in and stores
 * the key, and Apply reads the same one. That keeps this wrapper to what it
 * should be, a switch, rather than making it own auth for both.
 */
import { useState } from 'react';
import ResumeStudio from './ResumeStudio';
import ApplyPanel from './ApplyPanel';

type Tab = 'resume' | 'apply';

export default function StudioApp() {
  const [tab, setTab] = useState<Tab>('resume');

  return (
    <div className="studio-app">
      <nav className="studio-apps" aria-label="Studio section">
        {(
          [
            ['resume', 'Resume'],
            ['apply', 'Apply'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Both stay mounted: switching tabs must not throw away an unsaved
          resume edit or a draft that has not been sent yet. */}
      <div hidden={tab !== 'resume'}>
        <ResumeStudio />
      </div>
      <div hidden={tab !== 'apply'}>
        <ApplyPanel />
      </div>
    </div>
  );
}
