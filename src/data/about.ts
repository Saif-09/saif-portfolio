/**
 * The prose of the About page, lifted out of AboutPage.astro so the page and
 * its markdown twin (src/lib/markdown/pages.ts) render the same words. Two
 * copies of a bio is exactly the kind of drift an agent quotes back at you.
 */
import { profile, skills } from './profile';

/** The three-paragraph bio, in order. */
export const story: string[] = [
  `I'm Saif. "Product engineer" is a deliberate word order: the product comes first, the engineering exists to serve it. For 3.5 years I've taken ideas through design, code, app-store review, and the messy reality of production: mobile apps, web products, and the backends underneath them.`,
  `My conviction is in the positioning line on the front page. Software that ships and then just sits there, unmeasured, unloved, unchanged, is dead software, whatever its test coverage says. I build things people use, watch how they actually use them, and keep going.`,
  `The stack is a means: React Native, Next.js, Node.js, Firebase, and Postgres are what I currently reach for, and I'll drop any of them the day the product needs something else. AI is the honest exception: it's in how I build (leverage everywhere) and increasingly in what I build.`,
];

export const skillGroups: { label: string; items: readonly string[] }[] = [
  { label: 'Core stack', items: skills.coreStack },
  { label: 'Payments', items: skills.payments },
  { label: 'Performance', items: skills.performance },
  { label: 'Analytics & tooling', items: skills.analyticsAndTooling },
];

export const principles = [
  {
    title: 'Start from the problem',
    body: 'Not the framework, not the résumé keyword. The problem picks the tech; picking tech first is how dead software gets born.',
  },
  {
    title: 'Ship, measure, iterate',
    body: "A shipped v1 plus real usage data beats a perfect v3 in a branch. Production is where products are finished, not where they're revealed.",
  },
  {
    title: 'Polish the states nobody screenshots',
    body: 'Empty, loading, offline, error. Users hit them constantly; portfolios never show them. The gap between demo-quality and product-quality lives there.',
  },
  {
    title: 'AI as leverage, not crutch',
    body: "I use AI to move faster on the parts that don't need me, and keep judgment, architecture, and taste firmly human. Leverage compounds; dependence rots.",
  },
] as const;

export const foundingHeading = 'A fit for founding teams';

export const foundingLead =
  "If you're early and need one person who can take an idea to a shipped, measured product, that's the job I'm built for. Why I'm a strong founding engineer:";

/** The case for Mohd Saif as a founding engineer, grounded in real work. */
export const foundingReasons: { lead: string; body: string }[] = [
  {
    lead: '0→1 is my default.',
    body: "I've taken multiple products from an empty repo to the App Store and Play Store: Wellbeing Nutrition, Zenzop, and the Shloka app at Gurucool, plus personal products like Ueue and Prism.",
  },
  {
    lead: 'I cover the whole stack.',
    body: 'Design, mobile (iOS and Android), web, and the Node and Python backends behind them. A founding engineer has to wear every hat, and I already do.',
  },
  {
    lead: 'Product judgment, not just code.',
    body: 'I make the product and UX calls alongside the implementation, so scope stays tight and the right thing ships first, instead of building whatever the ticket says.',
  },
  {
    lead: 'I ship fast, with AI as leverage.',
    body: 'High output from a small footprint, exactly what an early team needs in the window before there is a team.',
  },
  {
    lead: 'I wire up the unglamorous essentials.',
    body: 'Payments and subscriptions, analytics, deep linking, and growth instrumentation: the plumbing a young product needs to make money and actually learn from users.',
  },
  {
    lead: 'Bias to production.',
    body: 'I ship, measure with real usage data, and iterate. Dead software helps no one, least of all a startup counting runway.',
  },
];

/**
 * FAQ: visible Q&A (accordion on the page) plus FAQPage structured data plus
 * the markdown twin. Answers are plain, factual, and keyword-natural, the
 * format AI engines extract and cite most reliably. Keep all three identical.
 */
export const faqs: { q: string; a: string }[] = [
  {
    q: 'Who is Mohd Saif?',
    a: 'Mohd Saif is a product engineer with 3.5+ years of experience who designs and builds software products end to end: mobile apps, web products, and the backends behind them. His positioning is simple: he builds solutions, not dead software, things people actually use, measured and iterated in production.',
  },
  {
    q: 'What is a product engineer, and how is it different from a software engineer?',
    a: 'A product engineer owns outcomes, not just code. Mohd works across design, engineering, app-store release, and production iteration, making product and UX decisions alongside the implementation, so features ship as complete products rather than tickets.',
  },
  {
    q: 'What technologies and tools does Mohd Saif use?',
    a: 'His core stack is React Native, React, Next.js, TypeScript, Node.js, Python, Firebase, Socket.IO, Postgres, MongoDB, and Redis. He integrates payments (Apple IAP, Razorpay, Stripe, PayPal, GoKwik, Qonversion) and analytics and engagement (PostHog, CleverTap, WebEngage, Adjust), and applies performance techniques like FlashList virtualization, Reanimated 3, MMKV persistence, and deferred deep linking.',
  },
  {
    q: 'Which companies has Mohd Saif worked with?',
    a: "He has built and shipped products at Shoppin', Wellbeing Nutrition, Gurucool, Zenzop, Supertails, and Infinite Locus, across iOS, Android, and web.",
  },
  {
    q: 'Can Mohd Saif build a product from scratch (0 to 1)?',
    a: 'Yes. He has taken multiple products from zero to launch, including Wellbeing Nutrition, Zenzop, and the Shloka app at Gurucool, plus personal products like Ueue and Prism, handling everything from the first sketch through app-store review to production iteration.',
  },
  {
    q: 'How does Mohd Saif use AI in his work?',
    a: 'AI shows up two ways: in how he builds (using tools like Claude Code as leverage across the workflow) and increasingly in what he builds (LLM-powered features, chat, and retrieval). This site itself includes a custom "ask this site" AI demo.',
  },
  {
    q: 'Would Mohd Saif be a good founding engineer?',
    a: "Yes, it is arguably his ideal role. He defaults to 0→1, having taken multiple products from an empty repo to the App Store and Play Store; he covers the whole stack (design, iOS, Android, web, and backends); he makes product decisions alongside the code; he ships fast using AI as leverage; and he wires up the essentials a young product needs, payments, subscriptions, analytics, and deep linking. His bias is to production: ship, measure with real usage, and iterate.",
  },
  {
    q: 'How can I contact or hire Mohd Saif?',
    a: `Use the contact form on this site or email ${profile.email}. He is also on GitHub and LinkedIn, linked in the site footer.`,
  },
];
