import { useEffect, useRef, useState } from 'react';

export interface LanguageItem {
  code: string;
  /** BCP-47 tag, used for lang/hreflang on the link. */
  lang: string;
  nativeName: string;
  href: string;
  current: boolean;
}

interface Props {
  /** Accessible label for the menu button, in the active locale. */
  label: string;
  /** Endonym of the active locale, shown on the button. */
  currentName: string;
  items: LanguageItem[];
  /** "up" opens the menu above the button (for footer placement). */
  menuPlacement?: 'down' | 'up';
}

export default function LanguageSwitcher({
  label,
  currentName,
  items,
  menuPlacement = 'down',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="lang-switcher" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="control lang-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${currentName} · ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
        </svg>
        <span>{currentName}</span>
      </button>
      {open && (
        <ul
          className={`lang-menu${menuPlacement === 'up' ? ' lang-menu--up' : ''}`}
          role="list"
        >
          {items.map((item) => (
            <li key={item.code}>
              <a
                href={item.href}
                lang={item.lang}
                hrefLang={item.lang}
                dir="auto"
                aria-current={item.current ? 'true' : undefined}
              >
                {item.nativeName}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
