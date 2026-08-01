/**
 * Shared plumbing for the knowledge-graph canvases (full /brain graph and
 * the homepage mini-graph): data types, Stone tone mapping, and rendering.
 *
 * Everything is tonal - node "color" is a mix between --bg and --ink whose
 * ratio encodes the note type. No hue anywhere.
 */

export interface GraphNode {
  id: string;
  title: string;
  slug: string;
  type: string;
  degree: number;
  tags: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export async function loadGraph(): Promise<GraphData> {
  const res = await fetch('/graph.json');
  if (!res.ok) throw new Error(`graph.json → ${res.status}`);
  return res.json();
}

/* --- Stone tones --- */

/** How far each type sits between --bg (0) and --ink (1). */
const TYPE_MIX: Record<string, number> = {
  moc: 1,
  meta: 0.85,
  decision: 0.7,
  feature: 0.55,
  design: 0.42,
  phase: 0.32,
};

/** Glyph per note type - same characters render in the legend. */
export const TYPE_GLYPHS: Record<string, string> = {
  moc: '✦',
  meta: '◎',
  decision: '◆',
  feature: '■',
  design: '▲',
  phase: '◐',
};

export interface Palette {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  surface: string;
  accent: string;
  nodeTone: (type: string) => string;
  /** Glyph color that stays readable on the node's tone. */
  glyphTone: (type: string) => string;
}

function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexChannels(a);
  const cb = hexChannels(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const get = (name: string) => styles.getPropertyValue(name).trim();
  const bg = get('--bg');
  const ink = get('--ink');
  return {
    bg,
    ink,
    muted: get('--muted'),
    line: get('--line'),
    surface: get('--surface'),
    accent: get('--accent'),
    nodeTone: (type) => mixHex(bg, ink, TYPE_MIX[type] ?? 0.5),
    glyphTone: (type) => ((TYPE_MIX[type] ?? 0.5) >= 0.5 ? bg : ink),
  };
}

/** Re-run `apply` whenever the theme attribute flips. Returns a cleanup. */
export function onThemeChange(apply: () => void): () => void {
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

export const nodeRadius = (node: GraphNode) =>
  4 + Math.sqrt(node.degree || 1) * 2.4;

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** Transform that frames the current layout inside width×height. */
export function fitTransform(
  data: GraphData,
  width: number,
  height: number,
  padding = 48,
  maxK = 1.6,
): ViewTransform {
  const xs = data.nodes.map((n) => n.x ?? 0);
  const ys = data.nodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1) + padding * 2;
  const h = Math.max(maxY - minY, 1) + padding * 2;
  const k = Math.min(maxK, Math.max(0.35, Math.min(width / w, height / h)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { k, x: width / 2 - cx * k, y: height / 2 - cy * k };
}

export interface DrawOptions {
  palette: Palette;
  transform: ViewTransform;
  dpr: number;
  width: number;
  height: number;
  hovered?: GraphNode | null;
  /** Persistently focused node ("you are here") - accent ring + neighborhood. */
  focused?: GraphNode | null;
  /** ids kept at full strength; when set, everything else dims. */
  emphasis?: Set<string> | null;
  /** Label rendering threshold - labels appear when k * radius is big enough. */
  showLabels?: boolean;
}

function neighbourhoodOf(data: GraphData, node: GraphNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const link of data.links) {
    const s = typeof link.source === 'object' ? link.source.id : (link.source as string);
    const t = typeof link.target === 'object' ? link.target.id : (link.target as string);
    if (s === node.id) ids.add(t);
    if (t === node.id) ids.add(s);
  }
  return ids;
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  data: GraphData,
  options: DrawOptions,
): void {
  const { palette, transform, dpr, width, height, hovered, focused, emphasis, showLabels } =
    options;

  const active = hovered ?? focused ?? null;
  const neighbourhood = active ? neighbourhoodOf(data, active) : new Set<string>();

  const strength = (id: string): number => {
    if (active) return neighbourhood.has(id) ? 1 : 0.14;
    if (emphasis) return emphasis.has(id) ? 1 : 0.12;
    return 1;
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(
    dpr * transform.k,
    0,
    0,
    dpr * transform.k,
    dpr * transform.x,
    dpr * transform.y,
  );

  /* links */
  ctx.lineWidth = 1 / transform.k;
  for (const link of data.links) {
    const s = link.source as GraphNode;
    const t = link.target as GraphNode;
    if (s.x === undefined || t.x === undefined) continue;
    const a = Math.min(strength(s.id), strength(t.id));
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = palette.line;
    if (active && a === 1) {
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = 1.5 / transform.k;
    }
    ctx.beginPath();
    ctx.moveTo(s.x!, s.y!);
    ctx.lineTo(t.x!, t.y!);
    ctx.stroke();
    ctx.lineWidth = 1 / transform.k;
  }

  /* nodes + type glyphs */
  ctx.textAlign = 'center';
  for (const node of data.nodes) {
    if (node.x === undefined) continue;
    const r = nodeRadius(node);
    const a = strength(node.id);
    ctx.globalAlpha = a;
    ctx.fillStyle = palette.nodeTone(node.type);
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2);
    ctx.fill();

    const glyph = TYPE_GLYPHS[node.type];
    if (glyph && r * transform.k >= 6) {
      ctx.fillStyle = palette.glyphTone(node.type);
      ctx.font = `${r * 1.05}px ui-sans-serif, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, node.x!, node.y! + r * 0.05);
    }

    if (hovered?.id === node.id) {
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.5 / transform.k;
      ctx.stroke();
    }

    /* "you are here": one restrained accent ring on the focused node */
    if (focused?.id === node.id) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2.5 / transform.k;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r + 4 / transform.k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* labels - greedy collision avoidance, priority to active + high degree */
  if (showLabels) {
    const fontSize = 11 / transform.k;
    ctx.font = `500 ${fontSize}px Inter, ui-sans-serif, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const candidates = [...data.nodes]
      .filter((n) => n.x !== undefined)
      .sort((a, b) => {
        const pa = (active && neighbourhood.has(a.id) ? 1000 : 0) + a.degree;
        const pb = (active && neighbourhood.has(b.id) ? 1000 : 0) + b.degree;
        return pb - pa;
      });

    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const node of candidates) {
      const isActive = active !== null && neighbourhood.has(node.id);
      const big = nodeRadius(node) * transform.k >= 10;
      if (!big && !isActive) continue;

      const w = ctx.measureText(node.title).width;
      const h = fontSize * 1.3;
      const x = node.x!;
      const y = node.y! + nodeRadius(node) + 4 / transform.k;
      const box = { x1: x - w / 2, y1: y, x2: x + w / 2, y2: y + h };
      const collides = placed.some(
        (p) => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1,
      );
      if (collides && !isActive) continue; // active labels always win
      placed.push(box);

      ctx.globalAlpha = strength(node.id) * (isActive ? 1 : 0.75);
      ctx.fillStyle = isActive ? palette.ink : palette.muted;
      ctx.fillText(node.title, x, y);
    }
  }

  ctx.globalAlpha = 1;
}

/** Node under a canvas-space (CSS px) point, honouring the view transform. */
export function pickNode(
  data: GraphData,
  transform: ViewTransform,
  px: number,
  py: number,
  slop = 4,
): GraphNode | null {
  const gx = (px - transform.x) / transform.k;
  const gy = (py - transform.y) / transform.k;
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const node of data.nodes) {
    if (node.x === undefined) continue;
    const r = nodeRadius(node) + slop / transform.k;
    const dx = gx - node.x!;
    const dy = gy - node.y!;
    const d = dx * dx + dy * dy;
    if (d <= r * r && d < bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}
