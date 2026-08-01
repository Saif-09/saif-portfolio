import { useEffect } from 'react';

/**
 * Sitewide motion layer. Renders nothing; hydrates at idle and wires Lenis
 * smooth scroll + GSAP/ScrollTrigger reveals. Remounts per page under view
 * transitions (the island lives in the swapped body), so init/cleanup runs
 * on every navigation.
 *
 * Principles enforced here:
 * - prefers-reduced-motion → this module does nothing (native scroll,
 *   every element already in its final state - nothing is hidden by CSS).
 * - Only elements still BELOW the viewport at init are registered for
 *   reveals, so content the user is already reading never animates.
 * - Transform + opacity only; will-change is scoped and cleared after.
 * - Reveals fire once (ScrollTrigger.batch, once: true).
 * - The old pinned work transition is gone (Phase 7 audit): it caused
 *   scroll jumps when hover transforms resized the pin. Stability wins.
 */

const REVEAL_EASE = 'expo.out'; // ≈ cubic-bezier(0.16, 1, 0.3, 1)

/**
 * Navigation sweep - registered ONCE at module scope (the module survives
 * view-transition swaps). On history traversal Astro restores a DOM
 * snapshot taken at leave time, which fossilizes gsap's armed inline
 * styles (opacity: 0, translate) with no live triggers to release them.
 * This strips every stale animation style right after each swap; if a
 * motion instance then initializes it re-arms cleanly, and if none does
 * the content is simply visible. Runs before client:idle hydration, so it
 * never fights fresh arming.
 */
const ANIMATION_PROPS = ['opacity', 'transform', 'translate', 'rotate', 'scale', 'will-change'];

function sweepStaleAnimationStyles() {
  document.querySelectorAll<HTMLElement>('[data-reveal], [data-split]').forEach((el) => {
    el.classList.remove('reveal-armed', 'reveal-in');
    ANIMATION_PROPS.forEach((prop) => el.style.removeProperty(prop));
    el.querySelectorAll<HTMLElement>('[style]').forEach((child) => {
      ANIMATION_PROPS.forEach((prop) => child.style.removeProperty(prop));
    });
  });

  /* History-traversal snapshots can fossilize an ACTIVE ScrollTrigger pin:
     the hero comes back wrapped in a .pin-spacer with inline fixed
     positioning and a mid-scrub transform, and - because the fresh init
     only creates the pin near the top of the page - nothing ever releases
     it. Dissolve any pin corpse: unwrap spacers, strip pinned inline
     styles, drop the curtain class. A live init re-creates all of this
     cleanly afterwards if appropriate. */
  document.querySelectorAll<HTMLElement>('.pin-spacer').forEach((spacer) => {
    const parent = spacer.parentNode;
    if (!parent) return;
    while (spacer.firstChild) parent.insertBefore(spacer.firstChild, spacer);
    spacer.remove();
  });
  document.querySelectorAll<HTMLElement>('.hero, .hero-inner').forEach((el) => {
    el.removeAttribute('style');
  });
  document.body.classList.remove('hero-curtain');
}

/**
 * Section reveals - module-level singleton, NOT part of the component
 * lifecycle. History-traversal snapshots and island teardown races proved
 * able to kill component-owned ScrollTriggers while elements sat armed at
 * opacity 0. This IO + CSS-class design has no kill surface: the observer
 * belongs to the module (which survives every swap), re-collects elements
 * on every astro:page-load, and the armed state is a class the sweep
 * always clears first. Content visibility never depends on GSAP state.
 */
let revealObserver: IntersectionObserver | undefined;

function setupReveals() {
  revealObserver?.disconnect();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
    (el) => el.getBoundingClientRect().top > window.innerHeight * 0.9,
  );
  if (candidates.length === 0) return;

  revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry, index) => {
          const el = entry.target as HTMLElement;
          observer.unobserve(el);
          el.style.transitionDelay = `${Math.min(index, 5) * 80}ms`;
          el.classList.add('reveal-in');
          window.setTimeout(() => el.style.removeProperty('transition-delay'), 1200);
        });
    },
    { rootMargin: '0px 0px -64px 0px' },
  );

  candidates.forEach((el) => {
    el.classList.add('reveal-armed');
    revealObserver!.observe(el);
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('astro:after-swap', sweepStaleAnimationStyles);
  document.addEventListener('astro:page-load', () => {
    sweepStaleAnimationStyles();
    setupReveals();
  });
  /* Initial load without the router event (e.g. hard refresh mid-history). */
  if (document.readyState !== 'loading') setupReveals();
  else document.addEventListener('DOMContentLoaded', () => setupReveals(), { once: true });
}

export default function MotionRoot() {
  useEffect(() => {
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let teardown: (() => void) | undefined;

    async function init() {
      if (reducedQuery.matches || teardown) return;

      const [{ default: Lenis }, { gsap }, { ScrollTrigger }, { SplitText }] =
        await Promise.all([
          import('lenis'),
          import('gsap'),
          import('gsap/ScrollTrigger'),
          import('gsap/SplitText'),
        ]);
      if (cancelled || reducedQuery.matches || teardown) return;

      gsap.registerPlugin(ScrollTrigger, SplitText);

      /* Every trigger THIS instance creates is tracked and killed by name.
         Never ScrollTrigger.getAll() - under view transitions the previous
         page's teardown can run AFTER this page's init, and a global kill
         would strand freshly-armed (opacity 0) elements forever. */
      const ownTriggers: InstanceType<typeof ScrollTrigger>[] = [];

      /* --- Lenis, driven by GSAP's rAF, synced to ScrollTrigger ---
         lerp 0.18: content follows the wheel tightly. Floatier values
         (0.1–0.12) make the page lag its input, which users read as
         "heavy" scrolling. */
      const lenis = new Lenis({ lerp: 0.18 });
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      /* In-page anchors scroll smoothly through Lenis. */
      const onAnchorClick = (event: MouseEvent) => {
        const anchor = (event.target as Element).closest?.('a[href^="#"]');
        if (!anchor) return;
        const target = document.querySelector(anchor.getAttribute('href')!);
        if (!target) return;
        event.preventDefault();
        lenis.scrollTo(target as HTMLElement, { offset: -72 });
      };
      document.addEventListener('click', onAnchorClick);

      /* Elements already on screen stay static - the user may be reading. */
      const belowFold = (el: Element) =>
        el.getBoundingClientRect().top > window.innerHeight * 0.9;

      const mm = gsap.matchMedia();

      /* --- Split-text reveals on big headings, enter-once ---
         Chars for Latin locales; words for joined/Indic scripts so
         shaping (Arabic joining etc.) is never broken mid-word. */
      const lang = document.documentElement.lang;
      const latin = ['en', 'hi-Latn'].includes(lang);
      const splits: InstanceType<typeof SplitText>[] = [];
      /* Component-local IO (not ScrollTrigger): nothing outside this
         instance can kill it, and if the instance dies mid-arm the
         navigation sweep + html:not(.lenis) failsafe restore the text. */
      const splitObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            const play = splitPlays.get(entry.target as HTMLElement);
            play?.();
          });
        },
        { rootMargin: '0px 0px -80px 0px' },
      );
      const splitPlays = new Map<HTMLElement, () => void>();
      document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
        if (!belowFold(el)) return;
        /* chars only ever inside atomic words - lines must never break
           mid-word; non-Latin scripts animate whole words (shaping). */
        const split = new SplitText(el, {
          type: latin ? 'words,chars' : 'words',
          mask: latin ? 'chars' : 'words',
        });
        splits.push(split);
        const targets = latin ? split.chars : split.words;
        gsap.set(targets, { yPercent: 110 });
        splitPlays.set(el, () =>
          gsap.to(targets, {
            yPercent: 0,
            duration: 0.7,
            ease: REVEAL_EASE,
            stagger: Math.min(0.03, 0.5 / targets.length),
            onComplete: () => split.revert(),
          }),
        );
        splitObserver.observe(el);
      });

      /* The hero pin/curtain was REMOVED after five field failures
         (CLS, dead-zone feel, invisible bands, and two distinct
         stuck-hero states from navigation snapshot/ordering races).
         The hero now scrolls in normal flow - a state that cannot break.
         The site's pinned scroll sequence is the case-study sticky
         media rail (pure CSS). Do not reintroduce a GSAP hero pin. */

      /* --- Parallax on media ([data-parallax]), scrubbed, subtle --- */
      const parallaxEls = Array.from(
        document.querySelectorAll<HTMLElement>('[data-parallax]'),
      ).filter(belowFold);
      const parallaxTweens = parallaxEls.map((el) => {
        const tween = gsap.fromTo(
          el,
          { yPercent: 6 },
          {
            yPercent: -6,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
        if (tween.scrollTrigger) ownTriggers.push(tween.scrollTrigger);
        return tween;
      });

      /* Section reveals are handled by the module-level IO above - they
         must never depend on this component instance's lifecycle. */

      /* --- Magnetic hover (fine pointer only) ---
         [data-magnetic]      → CTA-strength pull
         [data-magnetic-card] → whole cards, much gentler */
      mm.add('(pointer: fine)', () => {
        const undos: (() => void)[] = [];
        const wire = (el: HTMLElement, factor: number, clamp: number) => {
          const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
          const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });
          const onMove = (event: MouseEvent) => {
            const rect = el.getBoundingClientRect();
            const relX = event.clientX - (rect.left + rect.width / 2);
            const relY = event.clientY - (rect.top + rect.height / 2);
            xTo(gsap.utils.clamp(-clamp, clamp, relX * factor));
            yTo(gsap.utils.clamp(-clamp, clamp, relY * factor));
          };
          const onLeave = () => {
            xTo(0);
            yTo(0);
          };
          el.addEventListener('mousemove', onMove);
          el.addEventListener('mouseleave', onLeave);
          undos.push(() => {
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('mouseleave', onLeave);
            gsap.set(el, { clearProps: 'transform' });
          });
        };
        document
          .querySelectorAll<HTMLElement>('[data-magnetic]')
          .forEach((el) => wire(el, 0.35, 10));
        document
          .querySelectorAll<HTMLElement>('[data-magnetic-card]')
          .forEach((el) => wire(el, 0.02, 4));
        return () => undos.forEach((undo) => undo());
      });

      /* Re-measure once fonts have settled. */
      const refresh = () => ScrollTrigger.refresh();
      document.fonts?.ready.then(() => {
        if (!cancelled) refresh();
      });
      window.addEventListener('load', refresh);

      teardown = () => {
        window.removeEventListener('load', refresh);
        document.removeEventListener('click', onAnchorClick);
        mm.revert();
        parallaxTweens.forEach((tween) => tween.kill());
        splitObserver.disconnect();
        splits.forEach((split) => split.revert());
        /* Kill ONLY what this instance created - a global kill here races
           with the next page's init under view transitions. */
        ownTriggers.forEach((st) => st.kill());
        gsap.ticker.remove(tick);
        lenis.destroy();
        teardown = undefined;
      };
    }

    void init();

    /* Flipping the OS setting mid-session tears motion down / brings it back. */
    const onPreferenceChange = () => {
      if (reducedQuery.matches) teardown?.();
      else void init();
    };
    reducedQuery.addEventListener('change', onPreferenceChange);

    return () => {
      cancelled = true;
      reducedQuery.removeEventListener('change', onPreferenceChange);
      teardown?.();
    };
  }, []);

  return null;
}
