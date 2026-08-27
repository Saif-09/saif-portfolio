/**
 * The resume variants, as the studio UI sees them.
 *
 * A variant is named in four places and this is one of them. The others:
 *   - the \ifdefstring block in resume/resume.tex   (what changes)
 *   - pdf_name() in resume/build.sh                 (what it compiles to)
 *   - redirects in astro.config.mjs                 (where it is served)
 */
export const VARIANTS = [
  {
    id: 'product',
    label: 'Product',
    path: '/resume',
    pdf: '/Mohd_Saif_Resume.pdf',
    leads: 'Technical PM on AI products: scope, build, measure. The default.',
  },
  {
    id: 'fullstack',
    label: 'Full stack',
    path: '/resume/fullstack',
    pdf: '/Mohd_Saif_Resume_Fullstack.pdf',
    leads: 'Backend and APIs, shipping end to end',
  },
  {
    id: 'mobile',
    label: 'Mobile',
    path: '/resume/mobile',
    pdf: '/Mohd_Saif_Resume_Mobile.pdf',
    leads: 'React Native, native modules, store releases',
  },
  {
    id: 'ai',
    label: 'AI',
    path: '/resume/ai',
    pdf: '/Mohd_Saif_Resume_AI.pdf',
    leads: 'LLM pipelines, streaming, applied AI',
  },
] as const;

export type VariantId = (typeof VARIANTS)[number]['id'];

export const VARIANT_IDS = VARIANTS.map((v) => v.id) as readonly VariantId[];

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === 'string' && (VARIANT_IDS as readonly string[]).includes(value);
}
