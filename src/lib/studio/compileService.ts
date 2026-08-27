/**
 * Fast path for draft compiles.
 *
 * When COMPILE_URL and COMPILE_SECRET are set, a draft is compiled by the
 * container in compile-service/ and comes back in the same request: a few
 * hundred milliseconds warm. When they are not, the studio falls back to
 * compiling in CI, which works but costs about ninety seconds, nearly all of it
 * pulling the TeX image.
 *
 * Publishing never comes through here. That stays on CI, so the live resume
 * does not depend on this service being up.
 */
import { env } from './env';
import { VARIANTS } from './variants';

export interface FastCompileResult {
  /** filename (as published) -> base64 PDF */
  pdfs: Record<string, string>;
  ms: number;
}

export class CompileServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function fastCompileConfigured(): boolean {
  return Boolean(env('COMPILE_URL') && env('COMPILE_SECRET'));
}

/**
 * Compile every variant. Rejects with CompileServiceError on a real LaTeX
 * problem (422, which includes the one-page failure), and with a plain Error
 * when the service itself is unreachable, so the caller can tell "your document
 * is broken" from "the compiler is down" and fall back only for the latter.
 */
export async function fastCompile(
  tex: string,
  only?: string[],
): Promise<FastCompileResult> {
  const url = env('COMPILE_URL').replace(/\/$/, '');
  const secret = env('COMPILE_SECRET');
  if (!url || !secret) throw new Error('The compile service is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  let res: Response;
  try {
    res = await fetch(`${url}/compile`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-compile-secret': secret },
      body: JSON.stringify({
        tex,
        variants: only?.length ? only : VARIANTS.map((v) => v.id),
      }),
    });
  } catch (err) {
    throw new Error(
      `The compile service did not answer (${err instanceof Error ? err.message : 'unknown'}).`,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as {
    pdfs?: Record<string, string>;
    ms?: number;
    error?: string;
  };

  if (res.status === 422) {
    /* The document is wrong, not the service. Do not fall back: CI would just
       reach the same conclusion a minute later. */
    throw new CompileServiceError(data.error ?? 'The draft did not compile.', 422);
  }
  if (!res.ok) {
    throw new Error(data.error ?? `The compile service returned ${res.status}.`);
  }
  if (!data.pdfs || Object.keys(data.pdfs).length === 0) {
    throw new Error('The compile service returned no PDFs.');
  }

  return { pdfs: data.pdfs, ms: data.ms ?? 0 };
}
