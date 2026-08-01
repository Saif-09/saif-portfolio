import { lazy, Suspense, useEffect, useState } from 'react';

/**
 * Capability gate for the WebGL hero field.
 *
 * Renders nothing until every gate passes; the heavy three/R3F chunk is a
 * dynamic import, so degraded devices never download it. Gates:
 *  - motion allowed (no prefers-reduced-motion)
 *  - not mobile (coarse pointer or narrow viewport)
 *  - not low-power (deviceMemory <= 4 or hardwareConcurrency <= 4)
 *  - WebGL actually available
 *  - page fully loaded (hero text is the LCP element; we mount after it)
 *
 * The CSS poster on #hero-webgl-mount stays underneath as the permanent
 * fallback; the canvas simply fades in over it when it mounts.
 */

const HeroScene = lazy(() => import('./HeroScene'));

function capable(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.matchMedia('(pointer: coarse)').matches) return false;
  if (window.innerWidth < 768) return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.deviceMemory ?? 8) <= 4) return false;
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return false;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) return false;
  } catch {
    return false;
  }
  return true;
}

const afterLoad = () =>
  new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });

export default function HeroField() {
  const [mount, setMount] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!capable()) return;
      await afterLoad();
      // Give the browser a couple of frames to settle LCP paint.
      await new Promise((r) => setTimeout(r, 250));
      if (!cancelled && capable()) setMount(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Pause rendering when the hero is covered/off-screen or the tab is
     hidden. The hero itself is position: sticky (always technically in
     the viewport), so we watch the sentinel that scrolls past in normal
     flow right after it - sentinel gone above the fold ⇒ hero is fully
     covered by the curtain ⇒ stop burning GPU. */
  useEffect(() => {
    if (!mount) return;
    const target =
      document.querySelector('.hero-end-sentinel') ??
      document.getElementById('hero-webgl-mount');
    if (!target) return;
    let inView = true;
    const apply = () => setActive(inView && !document.hidden);
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        apply();
      },
      { rootMargin: '120px 0px 0px 0px' },
    );
    io.observe(target);
    document.addEventListener('visibilitychange', apply);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, [mount]);

  if (!mount) return null;
  return (
    <Suspense fallback={null}>
      <HeroScene active={active} onFail={() => setMount(false)} />
    </Suspense>
  );
}
