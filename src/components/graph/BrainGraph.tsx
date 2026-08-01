import { useEffect, useRef, useState } from 'react';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { emitTrack } from '../../lib/track/emit';
import {
  drawGraph,
  fitTransform,
  loadGraph,
  nodeRadius,
  onThemeChange,
  pickNode,
  readPalette,
  TYPE_GLYPHS,
  type GraphNode,
  type ViewTransform,
} from './core';

interface Props {
  /** Locale-aware prefix for note links, e.g. "/brain" or "/ar/brain". */
  basePath: string;
  searchLabel: string;
  searchPlaceholder: string;
  legendLabel: string;
  typeLabels: Record<string, string>;
}

/**
 * Obsidian-style force graph of the vault. Decorative (aria-hidden) - the
 * crawlable path is the note list below. Click a node to focus it (pan +
 * neighborhood highlight + accent "you are here" ring); click it again to
 * open the note. Reduced motion = static pre-computed layout.
 */
export default function BrainGraph({
  basePath,
  searchLabel,
  searchPlaceholder,
  legendLabel,
  typeLabels,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; type: string } | null>(null);
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  queryRef.current = query;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let destroyed = false;
    let cleanupFns: (() => void)[] = [];

    (async () => {
      const [data, d3] = await Promise.all([loadGraph(), import('d3-force')]);
      if (destroyed) return;

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ctx = canvas.getContext('2d')!;
      let palette = readPalette();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let width = 0;
      let height = 0;
      let fitted = false;
      const transform: ViewTransform = { x: 0, y: 0, k: 1 };
      let hovered: GraphNode | null = null;
      let focused: GraphNode | null = null;
      let needsDraw = true;

      const simulation = d3
        .forceSimulation(data.nodes as SimulationNodeDatum[])
        .force(
          'link',
          d3
            .forceLink(data.links as SimulationLinkDatum<SimulationNodeDatum>[])
            .id((node) => (node as GraphNode).id)
            .distance(92)
            .strength(0.5),
        )
        .force('charge', d3.forceManyBody().strength(-260))
        .force('center', d3.forceCenter(0, 0))
        .force(
          'collide',
          d3.forceCollide((node) => nodeRadius(node as GraphNode) + 6),
        )
        .stop();

      const fit = () => {
        const next = fitTransform(data, width, height);
        transform.x = next.x;
        transform.y = next.y;
        transform.k = next.k;
        fitted = true;
        needsDraw = true;
      };

      const resize = () => {
        width = wrap.clientWidth;
        height = wrap.clientHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        /* Guard against hydrating while the container is 0-sized (blank-
           canvas bug): re-frame on the first real measurement. */
        if (!fitted && width > 0 && height > 0) fit();
        needsDraw = true;
      };

      const emphasis = (): Set<string> | null => {
        const q = queryRef.current.trim().toLowerCase();
        if (!q) return null;
        return new Set(
          data.nodes
            .filter(
              (n) =>
                n.title.toLowerCase().includes(q) ||
                n.type.toLowerCase().includes(q) ||
                n.tags.some((tag) => tag.toLowerCase().includes(q)),
            )
            .map((n) => n.id),
        );
      };

      const draw = () => {
        drawGraph(ctx, data, {
          palette,
          transform,
          dpr,
          width,
          height,
          hovered,
          focused,
          emphasis: emphasis(),
          showLabels: true,
        });
      };

      cleanupFns.push(
        onThemeChange(() => {
          palette = readPalette();
          needsDraw = true;
        }),
      );

      /* --- layout: warm up off-screen, frame it, then (maybe) keep moving --- */
      simulation.tick(reduced ? 300 : 140);
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      cleanupFns.push(() => ro.disconnect());

      if (!reduced) {
        simulation.alpha(0.25).restart();
        simulation.on('tick', () => {
          needsDraw = true;
        });
        cleanupFns.push(() => simulation.stop());
      }

      let raf = 0;
      const loop = () => {
        if (needsDraw) {
          needsDraw = false;
          draw();
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      cleanupFns.push(() => cancelAnimationFrame(raf));

      /* Smoothly pan a node to center (instant under reduced motion). */
      let panRaf = 0;
      const panTo = (node: GraphNode) => {
        cancelAnimationFrame(panRaf);
        const targetX = width / 2 - node.x! * transform.k;
        const targetY = height / 2 - node.y! * transform.k;
        if (reduced) {
          transform.x = targetX;
          transform.y = targetY;
          needsDraw = true;
          return;
        }
        const fromX = transform.x;
        const fromY = transform.y;
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / 300);
          const eased = 1 - Math.pow(1 - t, 3);
          transform.x = fromX + (targetX - fromX) * eased;
          transform.y = fromY + (targetY - fromY) * eased;
          needsDraw = true;
          if (t < 1) panRaf = requestAnimationFrame(step);
        };
        panRaf = requestAnimationFrame(step);
      };
      cleanupFns.push(() => cancelAnimationFrame(panRaf));

      /* --- interaction --- */
      let mode: 'idle' | 'pan' | 'drag' = 'idle';
      let dragNode: GraphNode | null = null;
      let lastX = 0;
      let lastY = 0;
      let downX = 0;
      let downY = 0;

      const localPoint = (event: PointerEvent | WheelEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };

      const onPointerDown = (event: PointerEvent) => {
        const p = localPoint(event);
        lastX = downX = p.x;
        lastY = downY = p.y;
        const hit = pickNode(data, transform, p.x, p.y);
        if (hit) {
          mode = 'drag';
          dragNode = hit;
          hit.fx = hit.x;
          hit.fy = hit.y;
          if (!reduced) simulation.alphaTarget(0.3).restart();
        } else {
          mode = 'pan';
        }
        canvas.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        const p = localPoint(event);
        if (mode === 'pan') {
          transform.x += p.x - lastX;
          transform.y += p.y - lastY;
          lastX = p.x;
          lastY = p.y;
          needsDraw = true;
          return;
        }
        if (mode === 'drag' && dragNode) {
          dragNode.fx = (p.x - transform.x) / transform.k;
          dragNode.fy = (p.y - transform.y) / transform.k;
          if (reduced) {
            dragNode.x = dragNode.fx!;
            dragNode.y = dragNode.fy!;
          }
          needsDraw = true;
          return;
        }
        const hit = pickNode(data, transform, p.x, p.y);
        if (hit !== hovered) {
          hovered = hit;
          needsDraw = true;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          setTooltip(
            hit ? { x: p.x, y: p.y - 14, title: hit.title, type: hit.type } : null,
          );
        } else if (hit) {
          setTooltip({ x: p.x, y: p.y - 14, title: hit.title, type: hit.type });
        }
      };

      const onPointerUp = (event: PointerEvent) => {
        const p = localPoint(event);
        const moved = Math.hypot(p.x - downX, p.y - downY);
        const clicked = moved < 4;
        if (mode === 'drag' && dragNode) {
          dragNode.fx = null;
          dragNode.fy = null;
          if (!reduced) simulation.alphaTarget(0);
          if (clicked) {
            if (focused?.id === dragNode.id) {
              /* second click on the focused node opens the note */
              emitTrack('graph_node_click', { slug: dragNode.slug });
              window.location.href = `${basePath}/${dragNode.slug}/`;
              return;
            }
            focused = dragNode;
            panTo(dragNode);
          }
        } else if (mode === 'pan' && clicked) {
          focused = null; // click empty space → unfocus
          needsDraw = true;
        }
        mode = 'idle';
        dragNode = null;
      };

      const onPointerLeave = () => {
        hovered = null;
        setTooltip(null);
        needsDraw = true;
      };

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const p = localPoint(event);
        const factor = Math.exp(-event.deltaY * 0.0015);
        const k = Math.min(4, Math.max(0.35, transform.k * factor));
        const scale = k / transform.k;
        transform.x = p.x - (p.x - transform.x) * scale;
        transform.y = p.y - (p.y - transform.y) * scale;
        transform.k = k;
        needsDraw = true;
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.style.cursor = 'grab';
      canvas.style.touchAction = 'none';
      cleanupFns.push(() => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
      });
    })();

    return () => {
      destroyed = true;
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  /* search changes only need a repaint */
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('pointerleave'));
  }, [query]);

  return (
    <div className="graph-shell">
      <div className="graph-controls">
        <label className="sr-only" htmlFor="graph-search">
          {searchLabel}
        </label>
        <input
          id="graph-search"
          type="search"
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="graph-legend" aria-label={legendLabel} role="list">
          {Object.entries(TYPE_GLYPHS).map(([type, glyph]) => (
            <li key={type}>
              <span className="graph-legend-glyph" aria-hidden="true">
                {glyph}
              </span>
              {typeLabels[type] ?? type}
            </li>
          ))}
        </ul>
      </div>
      <div className="graph-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} aria-hidden="true" tabIndex={-1} />
        {tooltip && (
          <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <strong>{tooltip.title}</strong>
            <span>{typeLabels[tooltip.type] ?? tooltip.type}</span>
          </div>
        )}
      </div>
    </div>
  );
}
