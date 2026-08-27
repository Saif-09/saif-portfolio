/**
 * GitHub is the studio's storage layer.
 *
 * The studio reads and writes resume/resume.tex through the contents API rather
 * than the local filesystem, because a deployed function has no writable repo,
 * and because committing is what makes the change real: the push fires the
 * Build resume PDFs workflow, which compiles every variant, refuses to publish
 * anything that is not one page, and the resulting commit deploys.
 */
import { env } from '../env';

const OWNER = 'Saif-09';
const REPO = 'saif-portfolio';
const BRANCH = 'main';
const TEX_PATH = 'resume/resume.tex';
const WORKFLOW_FILE = 'resume.yml';

const API = 'https://api.github.com';

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function token(): string {
  const t = env('RESUME_GITHUB_TOKEN') || env('GH_TOKEN');
  if (!t) {
    throw new GithubError(
      'No GitHub token. Set RESUME_GITHUB_TOKEN in the Vercel project env to a fine-grained PAT with Contents read/write on this repo.',
      503,
    );
  }
  return t;
}

async function gh(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'saif-portfolio-resume-studio',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) detail = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new GithubError(`GitHub: ${detail}`, res.status);
  }
  return res.json();
}

export interface TexFile {
  tex: string;
  /** Blob sha, needed to write without clobbering a newer edit. */
  sha: string;
}

/** Read the live resume.tex from main, so a phone edit is never overwritten. */
export async function readTex(): Promise<TexFile> {
  const data = await gh(
    `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(TEX_PATH)}?ref=${BRANCH}`,
  );
  if (typeof data.content !== 'string') {
    throw new GithubError('resume.tex came back without content', 502);
  }
  return {
    tex: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  };
}

export interface SaveResult {
  sha: string;
  commitSha: string;
  commitUrl: string;
}

/**
 * Commit a new resume.tex. `sha` is the blob sha the edit was based on; GitHub
 * rejects the write if main has moved on, which is what stops the studio and a
 * phone edit from silently overwriting each other.
 */
export async function writeTex(
  tex: string,
  sha: string,
  message: string,
): Promise<SaveResult> {
  const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(TEX_PATH)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(tex, 'utf8').toString('base64'),
      sha,
      branch: BRANCH,
    }),
  });
  return {
    sha: data.content?.sha ?? '',
    commitSha: data.commit?.sha ?? '',
    commitUrl: data.commit?.html_url ?? '',
  };
}

export interface RunStatus {
  id: number | null;
  /** queued | in_progress | completed */
  status: string | null;
  /** success | failure | cancelled | null while running */
  conclusion: string | null;
  url: string | null;
  startedAt: string | null;
  headSha: string | null;
  title: string | null;
}

/** The most recent run of the resume build, for the studio's status pill. */
export async function latestRun(): Promise<RunStatus> {
  const data = await gh(
    `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
  );
  const run = data.workflow_runs?.[0];
  if (!run) {
    return {
      id: null,
      status: null,
      conclusion: null,
      url: null,
      startedAt: null,
      headSha: null,
      title: null,
    };
  }
  return {
    id: run.id,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    url: run.html_url ?? null,
    startedAt: run.run_started_at ?? run.created_at ?? null,
    headSha: run.head_sha ?? null,
    title: run.display_title ?? null,
  };
}

/* ------------------------------------------------------- draft compiles */

/**
 * The studio's Compile button works by pushing the in-progress source to this
 * branch, which triggers resume-preview.yml. Nothing here reaches main, so a
 * draft is never published and never deploys.
 */
export const PREVIEW_BRANCH = 'resume-preview';
const PREVIEW_WORKFLOW = 'resume-preview.yml';
const PREVIEW_DIR = 'resume/preview';

/** Create the preview branch off main the first time it is needed. */
async function ensurePreviewBranch(): Promise<void> {
  try {
    await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${PREVIEW_BRANCH}`);
    return;
  } catch (err) {
    if (!(err instanceof GithubError) || err.status !== 404) throw err;
  }

  const main = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${PREVIEW_BRANCH}`,
      sha: main.object.sha,
    }),
  });
}

/**
 * Push a draft to the preview branch. Returns the commit that CI will build.
 * The branch is force-updated to whatever the studio last sent, so drafts do
 * not need to be based on each other.
 */
export async function pushDraft(tex: string): Promise<{ commitSha: string }> {
  await ensurePreviewBranch();

  /* The write needs the file's current blob sha ON THIS BRANCH. */
  let sha: string | undefined;
  try {
    const existing = await gh(
      `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(TEX_PATH)}?ref=${PREVIEW_BRANCH}`,
    );
    sha = existing.sha;
  } catch (err) {
    if (!(err instanceof GithubError) || err.status !== 404) throw err;
  }

  const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(TEX_PATH)}`, {
    method: 'PUT',
    body: JSON.stringify({
      /* [vercel skip] so a draft does not burn a preview deployment. GitHub
         Actions ignores that keyword, so the compile still runs. */
      message: 'Draft compile from the studio [vercel skip]',
      content: Buffer.from(tex, 'utf8').toString('base64'),
      branch: PREVIEW_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  return { commitSha: data.commit?.sha ?? '' };
}

/** Status of the draft compile. */
export async function latestPreviewRun(): Promise<RunStatus> {
  const data = await gh(
    `/repos/${OWNER}/${REPO}/actions/workflows/${PREVIEW_WORKFLOW}/runs?per_page=1`,
  );
  const run = data.workflow_runs?.[0];
  if (!run) {
    return {
      id: null,
      status: null,
      conclusion: null,
      url: null,
      startedAt: null,
      headSha: null,
      title: null,
    };
  }
  return {
    id: run.id,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    url: run.html_url ?? null,
    startedAt: run.run_started_at ?? run.created_at ?? null,
    headSha: run.head_sha ?? null,
    title: run.display_title ?? null,
  };
}

/** One freshly compiled draft PDF, straight off the preview branch. */
export async function readPreviewPdf(filename: string): Promise<Buffer> {
  const data = await gh(
    `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(`${PREVIEW_DIR}/${filename}`)}?ref=${PREVIEW_BRANCH}`,
  );
  if (typeof data.content !== 'string') {
    throw new GithubError(`${filename} came back without content`, 502);
  }
  return Buffer.from(data.content, 'base64');
}
