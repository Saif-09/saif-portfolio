import { useEffect, useRef, useState } from 'react';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { emitTrack } from '../../lib/track/emit';
import {
  drawGraph,
  fitTransform,
  loadGraph,
  onThemeChange,
  pickNode,
  readPalette,
  type GraphData,
  type GraphNode,
  type ViewTransform,
} from './core';

interface Props {
  /** Locale-aware prefix for note links, e.g. "/brain" or "/ar/brain". */
  basePath: string;
}

/** Seed node the curated subgraph grows from. */
const SEED = 'portfolio-brain';
const MAX_NODES = 8;

/**
 * The homepage teaser: a small curated subgraph drifting gently.
 * Decorative (aria-hidden); pauses off-screen; static under
 * prefers-reduced-motion. Hover highlights, click opens the note.
 */
export default function MiniGraph({ basePath }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let destroyed = false;
    let cleanupFns: (() => void)[] = [];

    (async () => {
      const [full, d3] = await Promise.all([loadGraph(), import('d3-force')]);
      if (destroyed) return;

      /* curate: seed + its highest-degree neighbours */
      const bySlug = new Map(full.nodes.map((n) => [n.id, n]));
      const neighbours = new Set<string>([SEED]);
      const candidates = full.links
        .filter((l) => l.source === SEED || l.target === SEED)
        .map((l) => (l.source === SEED ? l.target : l.source) as string)
        .map((id) => bySlug.get(id)!)
        .filter(Boolean)
        .sort((a, b) => b.degree - a.degree);
      for (const c of candidates) {
        if (neighbours.size >= MAX_NODES) break;
        neighbours.add(c.id);
      }
      const data: GraphData = {
        nodes: full.nodes.filter((n) => neighbours.has(n.id)).map((n) => ({ ...n })),
        links: full.links.filter(
          (l) => neighbours.has(l.source as string) && neighbours.has(l.target as string),
        ),
      };

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ctx = canvas.getContext('2d')!;
      let palette = readPalette();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let width = 0;
      let height = 0;
      const transform: ViewTransform = { x: 0, y: 0, k: 1 };
      let hovered: GraphNode | null = null;
      let needsDraw = true;
      let inView = true;

      const simulation = d3
        .forceSimulation(data.nodes as SimulationNodeDatum[])
        .force(
          'link',
          d3
            .forceLink(data.links as SimulationLinkDatum<SimulationNodeDatum>[])
            .id((node) => (node as GraphNode).id)
            .distance(84)
            .strength(0.45),
        )
        .force('charge', d3.forceManyBody().strength(-240))
        .force('center', d3.forceCenter(0, 0))
        .force('x', d3.forceX(0).strength(0.04))
        .force('y', d3.forceY(0).strength(0.04))
        .stop();

      /* gentle wander so the cluster keeps drifting */
      let time = 0;
      const phases = data.nodes.map((_, i) => i * 2.39996);
      const wander = () => {
        data.nodes.forEach((node, i) => {
          node.vx = (node.vx ?? 0) + Math.sin(time * 0.4 + phases[i]) * 0.012;
          node.vy = (node.vy ?? 0) + Math.cos(time * 0.33 + phases[i] * 1.7) * 0.012;
        });
      };

      let fitted = false;
      const fit = () => {
        const fitted2 = fitTransform(data, width, height, 40, 1.4);
        transform.x = fitted2.x;
        transform.y = fitted2.y;
        transform.k = fitted2.k;
      };
      const resize = () => {
        width = wrap.clientWidth;
        height = wrap.clientHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        /* Guard against hydrating while the container is 0-sized (the
           blank-teaser bug): frame the layout on the first real size. */
        if (!fitted && width > 0 && height > 0 && data.nodes[0]?.x !== undefined) {
          fit();
          fitted = true;
        }
        needsDraw = true;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      cleanupFns.push(() => ro.disconnect());

      cleanupFns.push(
        onThemeChange(() => {
          palette = readPalette();
          needsDraw = true;
        }),
      );

      const draw = () =>
        drawGraph(ctx, data, {
          palette,
          transform,
          dpr,
          width,
          height,
          hovered,
          showLabels: true,
        });

      if (reduced) {
        simulation.tick(300);
        if (width > 0) {
          fit();
          fitted = true;
        }
        needsDraw = true;
        let raf = 0;
        const still = () => {
          if (needsDraw) {
            needsDraw = false;
            draw();
          }
          raf = requestAnimationFrame(still);
        };
        raf = requestAnimationFrame(still);
        cleanupFns.push(() => cancelAnimationFrame(raf));
      } else {
        simulation.tick(180); // settle first, then drift from a good layout
        if (width > 0) {
          fit();
          fitted = true;
        }
        simulation.alphaTarget(0.02).alphaDecay(0).velocityDecay(0.5);
        let raf = 0;
        let last = performance.now();
        let acc = 0;
        const loop = (now: number) => {
          raf = requestAnimationFrame(loop);
          if (!inView || document.hidden) return;
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          /* Gentle drift needs 30fps, not 60 - halves this island's
             main-thread + paint cost while it's on screen. */
          acc += dt;
          if (acc < 1 / 30) return;
          time += acc;
          acc = 0;
          wander();
          simulation.tick();
          draw();
        };
        raf = requestAnimationFrame(loop);
        cleanupFns.push(() => cancelAnimationFrame(raf));
      }

      const io = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting;
        },
        { threshold: 0.05 },
      );
      io.observe(wrap);
      cleanupFns.push(() => io.disconnect());

      /* hover + click-through */
      const onPointerMove = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const hit = pickNode(data, transform, event.clientX - rect.left, event.clientY - rect.top, 6);
        if (hit !== hovered) {
          hovered = hit;
          needsDraw = true;
          canvas.style.cursor = hit ? 'pointer' : 'default';
          setHoverTitle(hit ? hit.title : null);
          if (reduced) draw();
        }
      };
      const onClick = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const hit = pickNode(data, transform, event.clientX - rect.left, event.clientY - rect.top, 6);
        if (hit) {
          emitTrack('graph_node_click', { slug: hit.slug });
          window.location.href = `${basePath}/${hit.slug}/`;
        }
      };
      const onLeave = () => {
        hovered = null;
        setHoverTitle(null);
        needsDraw = true;
        if (reduced) draw();
      };
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('pointerleave', onLeave);
      cleanupFns.push(() => {
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('pointerleave', onLeave);
      });
    })();

    return () => {
      destroyed = true;
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
    };
  }, [basePath]);

  return (
    <div className="mini-graph" ref={wrapRef}>
      <canvas ref={canvasRef} aria-hidden="true" tabIndex={-1} />
      {hoverTitle && <div className="mini-graph-hint">{hoverTitle}</div>}
    </div>
  );
}
