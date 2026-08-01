/** All projects shown in Selected Work. Featured ones have a case study at /work/[slug]. */

export type Track = 'professional' | 'personal';
export type Role = 'built-0-1' | 'contributed';

export interface ProjectLink {
  label: 'iOS' | 'Android' | 'Web' | 'Extension' | 'App';
  href: string;
}

export type Visual =
  /** Real screenshot of the live site (public/shots). */
  | { type: 'shot'; src: string; thumb: string; alt: string }
  /** Device-frame mockup; `screen` is the slot for a real app screenshot
      (drop a file at that path and it renders automatically). `screen2`
      adds a second phone on the case-study media rail. */
  | { type: 'phone'; screen: string; screen2?: string }
  /** Typographic tile (extensions/experiments without a page to shoot). */
  | { type: 'tile' };

export interface Project {
  /** Also the case-study slug for featured projects. */
  id: string;
  name: string;
  track: Track;
  role: Role;
  featured: boolean;
  /** Surfaced in the homepage "Selected work" shortlist. All featured
      projects still appear in full at /work. */
  homeFeatured?: boolean;
  /** One-line summary for cards. */
  summary: string;
  /** What kind of thing it is, e.g. "iOS + Android + web + backend". */
  scope: string;
  links: ProjectLink[];
  visual: Visual;
  /** Favicon in public/favicons, for the "live right now" row. */
  favicon?: string;
}

export const projects: Project[] = [
  // --- Professional ---
  {
    id: 'shoppin',
    name: "Shoppin'",
    track: 'professional',
    role: 'contributed',
    featured: true,
    homeFeatured: true,
    summary:
      'AI-powered shopping across iOS, Android, and web: product, apps, and backend.',
    scope: 'iOS + Android + web + backend + product',
    links: [
      { label: 'Web', href: 'https://shoppin.app/home' },
      {
        label: 'iOS',
        href: 'https://apps.apple.com/in/app/shoppin-ai-discovery-try-on/id6738202299',
      },
      {
        label: 'Android',
        href: 'https://play.google.com/store/apps/details?id=app.shoppin.ios',
      },
    ],
    visual: {
      type: 'phone',
      screen: '/shots/apps/shoppin.jpg',
      screen2: '/shots/apps/shoppin-2.jpg',
    },
    favicon: '/favicons/shoppin.png',
  },
  {
    id: 'wellbeing-nutrition',
    name: 'Wellbeing Nutrition',
    track: 'professional',
    role: 'built-0-1',
    featured: true,
    homeFeatured: true,
    summary:
      'D2C nutrition commerce app taken from zero to both app stores.',
    scope: 'iOS + Android',
    links: [
      {
        label: 'iOS',
        href: 'https://apps.apple.com/in/app/wellbeing-nutrition/id6654917685',
      },
      {
        label: 'Android',
        href: 'https://play.google.com/store/apps/details?id=com.coffye.pjfzfc',
      },
    ],
    visual: { type: 'phone', screen: '/shots/apps/wellbeing-nutrition.jpg' },
  },
  {
    id: 'zenzop',
    name: 'Zenzop',
    track: 'professional',
    role: 'built-0-1',
    featured: true,
    summary:
      'Delivery Shop and Rider apps built 0 to 1, with live tracking and iOS Live Activities.',
    scope: 'iOS + Android',
    links: [
      { label: 'iOS', href: 'https://apps.apple.com/in/app/zenzop/id6749267701' },
    ],
    visual: { type: 'phone', screen: '/shots/apps/zenzop.jpg' },
  },
  {
    id: 'gurucool',
    name: 'Gurucool',
    track: 'professional',
    role: 'built-0-1',
    featured: true,
    summary:
      'Built the Shloka app 0 to 1, then created and owned the Gurucool iOS app.',
    scope: 'iOS + Android',
    links: [
      {
        label: 'Android',
        href: 'https://play.google.com/store/apps/details?id=com.gurucool',
      },
    ],
    visual: { type: 'phone', screen: '/shots/apps/gurucool.jpg' },
  },
  {
    id: 'supertails',
    name: 'Supertails',
    track: 'professional',
    role: 'contributed',
    featured: false,
    summary: 'Online pet-care platform. Contributed to the iOS app.',
    scope: 'iOS',
    links: [
      {
        label: 'iOS',
        href: 'https://apps.apple.com/in/app/supertails-online-pet-shop/id1670908360',
      },
    ],
    visual: { type: 'phone', screen: '/shots/apps/supertails.jpg' },
  },

  // --- Personal / Labs ---
  {
    id: 'ueue',
    name: 'Ueue',
    track: 'personal',
    role: 'built-0-1',
    featured: true,
    homeFeatured: true,
    summary:
      'A solo-built ecosystem: iOS and Android apps, a browser extension, and a site.',
    scope: 'iOS + Android + extension + site',
    links: [
      {
        label: 'iOS',
        href: 'https://apps.apple.com/in/app/save-watch-later-ueue/id6783338928',
      },
      {
        label: 'Android',
        href: 'https://play.google.com/store/apps/details?id=com.ueue',
      },
      { label: 'Web', href: 'https://ueue.ziyarex.com/' },
      {
        label: 'Extension',
        href: 'https://chromewebstore.google.com/detail/jpblogopoikmddifigglmhbmmdlcdkpf',
      },
    ],
    visual: {
      type: 'shot',
      src: '/shots/ueue.jpg',
      thumb: '/shots/ueue-thumb.jpg',
      alt: 'Ueue landing page: "Save it now. Actually get to it later."',
    },
    favicon: '/favicons/ueue.png',
  },
  {
    id: 'prism',
    name: 'Prism',
    track: 'personal',
    role: 'built-0-1',
    featured: true,
    summary: 'Browser extension + site, designed and shipped solo.',
    scope: 'Extension + site',
    links: [
      { label: 'Web', href: 'https://prism.ziyarex.com/' },
      {
        label: 'Extension',
        href: 'https://chromewebstore.google.com/detail/hehmcipehcghgaiohfmplfckcjckiiai',
      },
    ],
    visual: {
      type: 'shot',
      src: '/shots/prism.jpg',
      thumb: '/shots/prism-thumb.jpg',
      alt: 'Prism landing page: "Watch what matters."',
    },
    favicon: '/favicons/prism.png',
  },
  {
    id: 'insomniac',
    name: 'Insomniac',
    track: 'personal',
    role: 'built-0-1',
    featured: true,
    homeFeatured: true,
    summary:
      'A macOS menu-bar app that keeps your Mac awake with the lid closed, safely.',
    scope: 'macOS app',
    links: [{ label: 'Web', href: 'https://saif-09.github.io/insomniac/' }],
    visual: {
      type: 'shot',
      src: '/shots/insomniac.jpg',
      thumb: '/shots/insomniac-thumb.jpg',
      alt: 'Insomniac: keep your Mac awake with the lid closed, safely',
    },
  },
  {
    id: 'cat-mode',
    name: 'Cat Mode',
    track: 'personal',
    role: 'built-0-1',
    featured: true,
    summary:
      'A Chrome extension that lets your cat pounce at the screen without hijacking playback.',
    scope: 'Extension + site',
    links: [
      { label: 'Web', href: 'https://saif-09.github.io/cat-mode/' },
      {
        label: 'Extension',
        href: 'https://chromewebstore.google.com/detail/fnccbbhppojahcammnnoadoajhndeion',
      },
    ],
    visual: {
      type: 'shot',
      src: '/shots/cat-mode.jpg',
      thumb: '/shots/cat-mode-thumb.jpg',
      alt: 'Cat Mode: let your cat pounce at the screen without breaking playback',
    },
  },
  {
    id: 'salute-button',
    name: 'Salute Button',
    track: 'personal',
    role: 'built-0-1',
    featured: false,
    summary: 'A live web product, running in production.',
    scope: 'Web',
    links: [{ label: 'Web', href: 'https://www.salutebutton.com/' }],
    visual: {
      type: 'shot',
      src: '/shots/salute-button.jpg',
      thumb: '/shots/salute-button-thumb.jpg',
      alt: 'Salute Button: live web product',
    },
    favicon: '/favicons/salute-button.png',
  },
  {
    id: 'zazz',
    name: 'Zazz',
    track: 'personal',
    role: 'built-0-1',
    featured: false,
    summary:
      'A Flutter mobile game with a Go backend, shipped to the Play Store. Flutter for smoother animation than React Native.',
    scope: 'Flutter game + Go backend + site',
    links: [
      { label: 'Web', href: 'https://zazz.ziyarex.com' },
      {
        label: 'Android',
        href: 'https://play.google.com/store/apps/details?id=com.zazz.game',
      },
    ],
    visual: {
      type: 'shot',
      src: '/shots/zazz.jpg',
      thumb: '/shots/zazz-thumb.jpg',
      alt: 'Zazz: quick games, real stakes. A black-first arcade of bite-size mini-games',
    },
  },
];

export const featuredProjects = projects.filter((p) => p.featured);
/** Curated shortlist for the homepage "Selected work" section. */
export const homeProjects = projects.filter((p) => p.homeFeatured);
export const byTrack = (track: Track) => projects.filter((p) => p.track === track);
