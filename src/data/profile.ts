/** Single source of truth for identity, links, and headline stats. */

export const profile = {
  name: 'Mohd Saif',
  role: 'Product Engineer',
  positioning: 'I build solutions, not dead software.',
  yearsExperience: '3.5',
  email: 'saifmd238@gmail.com',
  github: 'https://github.com/Saif-09',
  linkedin: 'https://www.linkedin.com/in/mohd-saif-134076141/',
  resume:
    'https://drive.google.com/file/d/133SpYRkTrLrvGxjR7F51gR-ZJYC_F2O2/view',
} as const;

/**
 * Skills, grouped. Single source of truth for the About page skill matrix,
 * the Person JSON-LD `knowsAbout`, the meta keywords, and the AI corpus, so
 * they never drift apart.
 */
export const skills = {
  coreStack: [
    'React Native',
    'React',
    'Next.js',
    'TypeScript',
    'JavaScript',
    'Node.js',
    'Python',
    'Firebase',
    'Socket.IO',
    'MMKV',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'GraphQL',
    'REST APIs',
  ],
  payments: [
    'Apple IAP',
    'Razorpay',
    'Stripe',
    'PayPal',
    'Apple Pay',
    'Google Pay',
    'GoKwik',
    'Qonversion',
  ],
  performance: [
    'MMKV persistence',
    'FlashList virtualization',
    'Reanimated 3',
    'Deferred deep linking (Universal Links + Adjust + WebEngage)',
    'Memory optimization',
    'Video preloading',
    'A/B testing',
    'CodePush',
  ],
  analyticsAndTooling: [
    'PostHog',
    'CleverTap',
    'WebEngage',
    'Adjust',
    'Google Search Console',
    'Claude Code',
    'Claude API',
    'LLM APIs & tooling',
    'Xcode',
    'Android Studio',
    'Notion',
    'Obsidian',
  ],
} as const;

/** Flat skill list for structured data (Person.knowsAbout). */
export const allSkills: string[] = [
  'Product engineering',
  'Mobile app development',
  '0→1 product development',
  'AI-assisted development',
  ...skills.coreStack,
  ...skills.payments,
  ...skills.performance,
  ...skills.analyticsAndTooling,
];

/** Past and present employers, for entity association (GEO/SEO). */
export const employers = [
  "Shoppin'",
  'Wellbeing Nutrition',
  'Gurucool',
  'Zenzop',
  'Supertails',
  'Infinite Locus',
] as const;

import { projects } from './projects';

/**
 * Headline stats for the proof strip - derived from the projects data so
 * they are real integers by construction, never placeholders.
 */
const appsShipped = projects.filter((p) =>
  p.links.some(
    (l) =>
      l.label === 'iOS' ||
      l.label === 'Mac' ||
      l.label === 'Android' ||
      l.label === 'App',
  ),
).length;

const liveProducts = projects.filter((p) =>
  p.links.some((l) => l.label === 'Web' || l.label === 'Extension'),
).length;

export const stats = {
  yearsExperience: '3.5',
  appsShipped: String(appsShipped),
  liveProducts: String(liveProducts),
} as const;

/**
 * Keyword list for the <meta name="keywords"> tag. Google ignores this tag,
 * but it is requested for coverage across other engines and is harmless.
 * Built from real skills, employers, projects, and role variants.
 */
export const keywords: string = Array.from(
  new Set([
    // identity + role
    'Mohd Saif',
    'Mohd Saif portfolio',
    'Mohd Saif product engineer',
    'Saif Siddiqui',
    'product engineer',
    'product engineer India',
    'product engineer Bangalore',
    'full stack developer',
    'full stack engineer',
    'mobile app developer',
    'React Native developer',
    'React Native engineer',
    'frontend engineer',
    'software engineer',
    'freelance product engineer',
    'hire product engineer',
    'hire React Native developer',
    '0 to 1 product engineer',
    'MVP developer',
    'startup engineer',
    'AI engineer',
    'AI product engineer',
    'applied AI developer',
    'iOS developer',
    'Android developer',
    'cross-platform mobile developer',
    'web developer',
    'backend developer',
    // skills (deduped from the grouped list)
    ...allSkills,
    'Flutter',
    'Flutter developer',
    'Dart',
    'Go',
    'Golang',
    'Golang developer',
    'Expo',
    'React Navigation',
    'Redux',
    'Zustand',
    'Tailwind CSS',
    'Swift',
    'SwiftUI',
    'Live Activities',
    'push notifications',
    'in-app purchases',
    'subscriptions',
    'deep linking',
    'universal links',
    'app store optimization',
    'CI/CD',
    'REST API development',
    'GraphQL subscriptions',
    'real-time apps',
    'WebSockets',
    'analytics engineering',
    'growth engineering',
    'product analytics',
    'LLM integration',
    'RAG',
    'prompt engineering',
    'Claude',
    'OpenAI',
    // employers
    ...employers,
    ...employers.map((e) => `${e} developer`),
    // projects
    ...projects.map((p) => p.name),
    ...projects.map((p) => `${p.name} app`),
  ]),
).join(', ');
