import { useEffect } from 'react';

/**
 * First-party, cookieless tracker (Phase 4). Renders nothing; hydrates at
 * idle and initialises after the load event so it never competes with LCP.
 *
 * Privacy: honors DNT/GPC (fully inert), no cookies, no fingerprinting.
 * The session id is a random UUID in sessionStorage (cleared when the tab
 * closes) rotated after 30 minutes of inactivity - enough for the funnel,
 * useless for tracking anyone across sites or days.
 */

interface QueuedEvent {
  type: string;
  path: string;
  locale: string | null;
  section: string | null;
  device: string | null;
  meta: Record<string, unknown>;
}

const FLUSH_INTERVAL_MS = 8000;
const SESSION_TTL_MS = 30 * 60_000;
const SCROLL_MILESTONES = [25, 50, 75, 100];

function trackingDeclined(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return (
    navigator.doNotTrack === '1' ||
    (window as Window & { doNotTrack?: string }).doNotTrack === '1' ||
    nav.globalPrivacyControl === true
  );
}

function getSession(): string {
  try {
    const raw = sessionStorage.getItem('sa:session');
    if (raw) {
      const { id, at } = JSON.parse(raw);
      if (Date.now() - at < SESSION_TTL_MS) {
        sessionStorage.setItem('sa:session', JSON.stringify({ id, at: Date.now() }));
        return id;
      }
    }
  } catch {
    /* storage unavailable → per-pageload id */
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem('sa:session', JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* fine */
  }
  return id;
}

function deviceInfo(): { device: string; os: string; browser: string } {
  const ua = navigator.userAgent;
  const device = /iPad|Tablet/i.test(ua)
    ? 'tablet'
    : /Mobi|Android/i.test(ua)
      ? 'mobile'
      : 'desktop';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac/i.test(ua)
        ? 'macOS'
        : /Android/i.test(ua)
          ? 'Android'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'other';
  return { device, os, browser };
}

/** Short, stable, non-identifying selector for the click map. */
function stableSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && parts.length < 3 && node !== document.body) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const cls = [...node.classList].filter((c) => !c.startsWith('astro-'))[0];
    if (cls) part += `.${cls}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' ').slice(0, 80);
}

function sectionOf(el: Element): string | null {
  const landmark = el.closest('section[id], header, footer');
  if (!landmark) return null;
  if (landmark.tagName === 'HEADER') return 'header';
  if (landmark.tagName === 'FOOTER') return 'footer';
  return landmark.id || null;
}

export default function TrackerRoot() {
  useEffect(() => {
    if (trackingDeclined()) return;

    let disposed = false;
    const cleanups: (() => void)[] = [];

    const start = () => {
      if (disposed) return;
      const session = getSession();
      const info = deviceInfo();
      const path = window.location.pathname;
      const locale = document.documentElement.lang || null;
      const queue: QueuedEvent[] = [];

      const push = (
        type: string,
        extra: { section?: string | null; meta?: Record<string, unknown> } = {},
      ) => {
        queue.push({
          type,
          path,
          locale,
          section: extra.section ?? null,
          device: info.device,
          meta: extra.meta ?? {},
        });
      };

      const flush = () => {
        if (queue.length === 0) return;
        collectSectionTime();
        const payload = JSON.stringify({ session, events: queue.splice(0, 40) });
        const blob = new Blob([payload], { type: 'application/json' });
        if (!navigator.sendBeacon?.('/api/track', blob)) {
          void fetch('/api/track', { method: 'POST', body: payload, keepalive: true }).catch(
            () => {},
          );
        }
      };

      /* --- pageview --- */
      let ref: string | null = null;
      try {
        const r = document.referrer && new URL(document.referrer);
        if (r && r.hostname !== window.location.hostname) ref = r.hostname;
      } catch {
        /* ignore malformed referrers */
      }
      push('pageview', {
        meta: {
          os: info.os,
          browser: info.browser,
          vw: window.innerWidth,
          vh: window.innerHeight,
          ...(ref ? { ref } : {}),
        },
      });

      /* --- scroll depth --- */
      const seenDepths = new Set<number>();
      const onScroll = () => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const pct = max <= 0 ? 100 : Math.round(((window.scrollY + 1) / max) * 100);
        for (const depth of SCROLL_MILESTONES) {
          if (pct >= depth && !seenDepths.has(depth)) {
            seenDepths.add(depth);
            push('scroll_depth', { meta: { depth } });
          }
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));

      /* --- time-on-section (IntersectionObserver) --- */
      const visibleSince = new Map<string, number>();
      const accumulated = new Map<string, number>();
      const seenSections = new Set<string>();
      const collectSectionTime = () => {
        const now = performance.now();
        for (const [section, since] of visibleSince) {
          accumulated.set(section, (accumulated.get(section) ?? 0) + (now - since));
          visibleSince.set(section, now);
        }
        for (const [section, ms] of accumulated) {
          if (ms >= 1000) {
            push('section_time', { section, meta: { ms: Math.round(ms) } });
            accumulated.delete(section);
          }
        }
      };
      const io = new IntersectionObserver(
        (entries) => {
          const now = performance.now();
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).id;
            if (!id) continue;
            if (entry.isIntersecting) {
              visibleSince.set(id, now);
              if (!seenSections.has(id)) {
                seenSections.add(id);
                push('section_view', { section: id });
              }
            } else if (visibleSince.has(id)) {
              accumulated.set(
                id,
                (accumulated.get(id) ?? 0) + (now - visibleSince.get(id)!),
              );
              visibleSince.delete(id);
            }
          }
        },
        { threshold: 0.4 },
      );
      document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));
      cleanups.push(() => io.disconnect());

      /* --- single delegated click listener --- */
      const onClick = (event: MouseEvent) => {
        const target = event.target as Element;
        if (!(target instanceof Element)) return;
        const section = sectionOf(target);
        const doc = document.documentElement;
        push('click', {
          section,
          meta: {
            sel: stableSelector(target),
            x: Number((event.clientX / window.innerWidth).toFixed(4)),
            y: Number((event.pageY / Math.max(doc.scrollHeight, 1)).toFixed(4)),
          },
        });

        /* named events, resolved from the same listener */
        const anchor = target.closest('a');
        if (target.closest('.theme-toggle')) push('theme_change');
        else if (anchor && target.closest('.lang-menu'))
          push('lang_change', { meta: { to: anchor.getAttribute('hreflang') ?? '' } });
        else if (anchor && target.closest('.card'))
          push('work_card_click', {
            section,
            meta: { href: anchor.getAttribute('href') ?? '' },
          });
        else if (anchor?.classList.contains('open-cta') || anchor?.closest('.hero-scroll'))
          push('cta_click', { meta: { sel: stableSelector(anchor) } });
      };
      document.addEventListener('click', onClick, { capture: true, passive: true });
      cleanups.push(() => document.removeEventListener('click', onClick, { capture: true }));

      /* contact form submit → funnel "contacted" */
      const onSubmit = (event: Event) => {
        const form = event.target as Element;
        if (form.closest('.contact-form')) push('contact');
      };
      document.addEventListener('submit', onSubmit, { capture: true, passive: true });
      cleanups.push(() => document.removeEventListener('submit', onSubmit, { capture: true }));

      /* named events from components (ask widget, graph nodes) */
      const onCustom = (event: Event) => {
        const { type, meta } = (event as CustomEvent).detail ?? {};
        if (typeof type === 'string') {
          push(type, { meta: meta ?? {} });
          if (type === 'graph_node_click') flush(); // page is about to unload
        }
      };
      window.addEventListener('sa:track', onCustom);
      cleanups.push(() => window.removeEventListener('sa:track', onCustom));

      /* --- flush loop + lifecycle --- */
      const interval = window.setInterval(flush, FLUSH_INTERVAL_MS);
      cleanups.push(() => window.clearInterval(interval));
      const onVisibility = () => {
        if (document.hidden) flush();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', flush);
      cleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', flush);
      });
    };

    /* never compete with first paint */
    if (document.readyState === 'complete') {
      const id = window.setTimeout(start, 400);
      cleanups.push(() => window.clearTimeout(id));
    } else {
      const onLoad = () => window.setTimeout(start, 400);
      window.addEventListener('load', onLoad, { once: true });
      cleanups.push(() => window.removeEventListener('load', onLoad));
    }

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
