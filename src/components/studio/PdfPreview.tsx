/**
 * The resume preview, rendered so that clicking a word can point at the LaTeX.
 *
 * This used to be an <iframe> around the browser's own PDF viewer, which is
 * fewer lines and renders better than anything hand-written. It had to go for
 * one reason: an iframe is a closed box. A click inside it is not visible to
 * this page, so there is no way to ask "what did they just click on".
 *
 * pdf.js is loaded on demand rather than imported at the top, so the studio's
 * first paint does not pay for a PDF engine it may never use.
 *
 * The tradeoff worth knowing: the links in the PDF are no longer clickable
 * here, because the annotation layer is not rendered. The published PDF is
 * untouched, and the preview header links out to the real one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Pick {
  /** The run of text under the pointer. */
  text: string;
  /** Its neighbours in reading order, used to pin down which one it is. */
  before: string;
  after: string;
}

type Pdfjs = typeof import('pdfjs-dist');

let engine: Promise<Pdfjs> | null = null;

function loadEngine(): Promise<Pdfjs> {
  if (!engine) {
    engine = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
  }
  return engine;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Item {
  str: string;
  box: Box;
}

interface RenderedPage {
  canvas: HTMLCanvasElement;
  items: Item[];
  width: number;
  height: number;
}

interface Props {
  url: string;
  title: string;
  onPick: (pick: Pick) => void;
  /** Shown under the pages, so the click target explains itself. */
  footnote?: React.ReactNode;
}

/** How far off a word a click can land and still count, in CSS pixels. */
const SLOP = 24;

export default function PdfPreview({ url, title, onPick, footnote }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const pages = useRef<RenderedPage[]>([]);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [mark, setMark] = useState<{ page: number; box: Box } | null>(null);
  const [count, setCount] = useState(0);

  /* Fit to the column, and re-fit when the column changes. */
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url || !width) return;
    let live = true;
    setState('loading');
    setMark(null);

    (async () => {
      try {
        const lib = await loadEngine();
        const doc = await lib.getDocument({ url }).promise;
        if (!live) return;
        setCount(doc.numPages);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rendered: RenderedPage[] = [];

        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (!live) return;

          const base = page.getViewport({ scale: 1 });
          const scale = ((width - 2) / base.width) * zoom;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          /* Draw at device resolution and scale down in CSS, or the text is
             soft on a retina screen. pdf.js applies this transform itself, so
             it must not also be applied to the context. */
          await page.render({
            canvas,
            viewport,
            transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
          }).promise;
          if (!live) return;

          /* Where every run of text sits, in the same CSS pixels a click
             reports, so hit testing is a rectangle test and nothing more. */
          const text = await page.getTextContent();
          const items: Item[] = [];
          for (const raw of text.items) {
            if (!('str' in raw) || !raw.str.trim()) continue;
            const t = lib.Util.transform(viewport.transform, raw.transform);
            const height = Math.hypot(t[2], t[3]) || raw.height * scale;
            items.push({
              str: raw.str,
              box: {
                left: t[4],
                top: t[5] - height * 0.88,
                width: raw.width * scale,
                height: height * 1.16,
              },
            });
          }

          rendered.push({ canvas, items, width: viewport.width, height: viewport.height });
        }

        if (!live) return;
        pages.current = rendered;
        setState('ready');
      } catch (err) {
        if (!live) return;
        setError(err instanceof Error ? err.message : 'The preview would not load.');
        setState('error');
      }
    })();

    return () => {
      live = false;
    };
  }, [url, width, zoom]);

  /* The canvases belong to pdf.js, not to React, so they are placed after the
     page slots exist rather than during the render that creates them. The old
     one is only removed once the new one is ready, which is what keeps the
     preview from blinking white on every recompile. */
  useEffect(() => {
    const node = holder.current;
    if (!node || state !== 'ready') return;
    pages.current.forEach((page, index) => {
      const slot = node.querySelector(`[data-page="${index}"]`);
      if (!slot) return;
      slot.querySelectorAll('canvas').forEach((old) => {
        if (old !== page.canvas) old.remove();
      });
      if (page.canvas.parentElement !== slot) slot.appendChild(page.canvas);
    });
  }, [state, count, url, zoom]);

  const clicked = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, index: number) => {
      const page = pages.current[index];
      if (!page) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      /* Inside a word wins. Otherwise the nearest word on the same line, so a
         click in the gutter still lands somewhere sensible. */
      let hit = -1;
      let bestArea = Infinity;
      page.items.forEach((item, i) => {
        const b = item.box;
        if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height) {
          const area = b.width * b.height;
          if (area < bestArea) {
            bestArea = area;
            hit = i;
          }
        }
      });

      if (hit === -1) {
        let bestDistance = Infinity;
        page.items.forEach((item, i) => {
          const b = item.box;
          if (y < b.top - SLOP || y > b.top + b.height + SLOP) return;
          const dx = x < b.left ? b.left - x : x > b.left + b.width ? x - (b.left + b.width) : 0;
          const dy = Math.abs(y - (b.top + b.height / 2));
          const distance = dx + dy;
          if (dx <= SLOP * 4 && distance < bestDistance) {
            bestDistance = distance;
            hit = i;
          }
        });
      }

      if (hit === -1) {
        setMark(null);
        return;
      }

      setMark({ page: index, box: page.items[hit].box });
      onPick({
        text: page.items[hit].str,
        before: page.items[hit - 1]?.str ?? '',
        after: page.items[hit + 1]?.str ?? '',
      });
    },
    [onPick],
  );

  return (
    <div className="studio-pdfjs">
      <div className="studio-zoom">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))}
          disabled={zoom <= 0.6}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="studio-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.2) * 10) / 10))}
          disabled={zoom >= 2.5}
          aria-label="Zoom in"
        >
          +
        </button>
        {zoom !== 1 && (
          <button type="button" className="studio-zoomreset" onClick={() => setZoom(1)}>
            Fit
          </button>
        )}
      </div>

      <div className="studio-pdfscroll" ref={holder}>
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="studio-pdfpage"
            data-page={index}
            onClick={(event) => clicked(event, index)}
            title="Click any word to find it in the LaTeX"
          >
            {mark?.page === index && (
              <span
                className="studio-pdfmark"
                style={{
                  left: mark.box.left,
                  top: mark.box.top,
                  width: mark.box.width,
                  height: mark.box.height,
                }}
              />
            )}
          </div>
        ))}
        {state === 'loading' && <p className="studio-muted">Rendering {title}…</p>}
        {state === 'error' && <p className="studio-error">{error}</p>}
      </div>

      {footnote}
    </div>
  );
}
