import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InsightsPayload } from '../../lib/analytics/db';

export interface DashStrings {
  liveNow: string;
  pageviews: string;
  uniques: string;
  ranges: { '24h': string; '7d': string; '30d': string };
  rangeLabel: string;
  topSections: string;
  topSectionsSummary: string;
  scrollDepth: string;
  scrollDepthSummary: string;
  clickMap: string;
  clickMapSummary: string;
  devices: string;
  os: string;
  browsers: string;
  referrers: string;
  locales: string;
  funnel: string;
  funnelSteps: { landed: string; viewedWork: string; usedDemo: string; contacted: string };
  viewAsTable: string;
  emptyState: string;
  sparkline: string;
  sparklineSummary: string;
  sparklineDay: string;
  minutes: string;
  sessions: string;
  count: string;
  section: string;
  depth: string;
  loading: string;
}

type Range = '24h' | '7d' | '30d';

/* count-up on first render; instant under reduced motion */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const from = previous.current;
    previous.current = target;
    const start = performance.now();
    const duration = 600;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function StatTile({ label, value, live }: { label: string; value: number; live?: boolean }) {
  const shown = useCountUp(value);
  return (
    <div className="dash-tile">
      <dt className="dash-tile-label">
        {live && <span className="dash-live-dot" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="dash-tile-value">{shown.toLocaleString('en')}</dd>
    </div>
  );
}

/** Owns its own polling state so the 10s live tick re-renders THIS tile
    only - never the eight chart blocks below it. */
function LiveTile({ label }: { label: string }) {
  const [live, setLive] = useState(0);
  useEffect(() => {
    const poll = () =>
      fetch('/api/live')
        .then((r) => r.json())
        .then((data) => setLive(data.live ?? 0))
        .catch(() => {});
    poll();
    const id = window.setInterval(poll, 10_000);
    return () => window.clearInterval(id);
  }, []);
  return <StatTile label={label} value={live} live />;
}

function Block({
  title,
  summary,
  tableLabel,
  table,
  children,
}: {
  title: string;
  summary?: string;
  tableLabel: string;
  table: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dash-block">
      <h2 className="dash-block-title">{title}</h2>
      {summary && <p className="dash-block-summary">{summary}</p>}
      {children}
      <details className="dash-table">
        <summary>{tableLabel}</summary>
        {table}
      </details>
    </section>
  );
}

function BarList({
  items,
  unit,
  nameHeader,
  t,
}: {
  items: { name: string; value: number }[];
  unit: string;
  nameHeader: string;
  t: DashStrings;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <>
      <ul className="dash-bars" role="list">
        {items.map((item) => (
          <li key={item.name} className="dash-bar-row">
            <span className="dash-bar-name">{item.name}</span>
            <span className="dash-bar-track">
              <span
                className="dash-bar-fill"
                style={{ inlineSize: `${(item.value / max) * 100}%` }}
              />
            </span>
            <span className="dash-bar-value">{item.value.toLocaleString('en')}</span>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="dash-empty">{t.emptyState}</p>}
    </>
  );
}

function tableOf(headers: string[], rows: (string | number)[][]) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalyticsDashboard({
  t,
  snapshot,
}: {
  t: DashStrings;
  snapshot: string;
}) {
  const [range, setRange] = useState<Range>('7d');
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInsights(null);
    fetch(`/api/insights?range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setInsights(data);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const scrollPoints = [25, 50, 75, 100].map((depth) => ({
    depth,
    sessions: insights?.scrollDepth.find((d) => d.depth === depth)?.sessions ?? 0,
  }));
  const scrollMax = Math.max(...scrollPoints.map((p) => p.sessions), 1);
  const funnelMax = Math.max(...(insights?.funnel.map((f) => f.sessions) ?? [0]), 1);

  return (
    <div className="dash">
      <dl className="dash-tiles">
        <LiveTile label={t.liveNow} />
        <StatTile label={t.pageviews} value={insights?.pageviews ?? 0} />
        <StatTile label={t.uniques} value={insights?.uniques ?? 0} />
      </dl>

      <div className="dash-ranges" role="group" aria-label={t.rangeLabel}>
        {(['24h', '7d', '30d'] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            className="chip dash-range"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {t.ranges[r]}
          </button>
        ))}
      </div>

      {!insights && (
        <div className="dash-grid" role="status" aria-label={t.loading}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="dash-block dash-skeleton" aria-hidden="true">
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-bar" style={{ inlineSize: '82%' }} />
              <span className="skeleton skeleton-bar" style={{ inlineSize: '64%' }} />
              <span className="skeleton skeleton-bar" style={{ inlineSize: '71%' }} />
            </div>
          ))}
        </div>
      )}

      {insights && (
        <div className="dash-grid">
          <Block
            title={t.sparkline}
            summary={t.sparklineSummary}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.sparklineDay, t.pageviews],
              insights.daily.map((d) => [d.day, d.pageviews]),
            )}
          >
            {insights.daily.length > 1 ? (
              <svg
                className="dash-sparkline"
                viewBox="0 0 400 80"
                role="img"
                aria-label={insights.daily
                  .map((d) => `${d.day}: ${d.pageviews}`)
                  .join(', ')}
              >
                <polyline
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="2"
                  points={insights.daily
                    .map((d, i) => {
                      const max = Math.max(...insights.daily.map((x) => x.pageviews), 1);
                      const x = 10 + (i / Math.max(insights.daily.length - 1, 1)) * 380;
                      return `${x},${72 - (d.pageviews / max) * 60}`;
                    })
                    .join(' ')}
                />
              </svg>
            ) : (
              <div className="dash-sparkline-empty" aria-hidden="true">
                <span className="skeleton skeleton-spark" />
                <p className="dash-empty">{t.emptyState}</p>
              </div>
            )}
          </Block>
          <Block
            title={t.topSections}
            summary={t.topSectionsSummary}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.section, t.minutes],
              insights.topSections.map((s) => [s.section, Math.round(s.ms / 60000)]),
            )}
          >
            <BarList
              t={t}
              unit={t.minutes}
              nameHeader={t.section}
              items={insights.topSections.map((s) => ({
                name: s.section,
                value: Math.round(s.ms / 60000) || 1,
              }))}
            />
          </Block>

          <Block
            title={t.scrollDepth}
            summary={t.scrollDepthSummary}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.depth, t.sessions],
              scrollPoints.map((p) => [`${p.depth}%`, p.sessions]),
            )}
          >
            <svg
              className="dash-scroll-curve"
              viewBox="0 0 400 140"
              role="img"
              aria-label={scrollPoints
                .map((p) => `${p.depth}%: ${p.sessions} ${t.sessions}`)
                .join(', ')}
            >
              <polyline
                fill="none"
                stroke="var(--muted)"
                strokeWidth="2"
                points={scrollPoints
                  .map((p, i) => `${20 + i * 120},${120 - (p.sessions / scrollMax) * 100}`)
                  .join(' ')}
              />
              {scrollPoints.map((p, i) => (
                <g key={p.depth}>
                  <circle
                    cx={20 + i * 120}
                    cy={120 - (p.sessions / scrollMax) * 100}
                    r="4"
                    fill="var(--ink)"
                  />
                  <text x={20 + i * 120} y={136} textAnchor="middle" className="dash-svg-label">
                    {p.depth}%
                  </text>
                </g>
              ))}
            </svg>
          </Block>

          <Block
            title={t.clickMap}
            summary={t.clickMapSummary}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.section, t.count],
              Object.entries(
                insights.clickMap.reduce<Record<string, number>>((acc, c) => {
                  const key = c.section ?? '-';
                  acc[key] = (acc[key] ?? 0) + 1;
                  return acc;
                }, {}),
              ).sort((a, b) => b[1] - a[1]),
            )}
          >
            <div className="dash-clickmap">
              <img src={snapshot} alt="" loading="lazy" decoding="async" />
              <div className="dash-clickmap-dots" aria-hidden="true">
                {insights.clickMap.map((c, i) => (
                  <span
                    key={i}
                    className="dash-click-dot"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </Block>

          <Block
            title={t.funnel}
            tableLabel={t.viewAsTable}
            table={tableOf(
              ['', t.sessions],
              insights.funnel.map((f) => [
                t.funnelSteps[f.step as keyof typeof t.funnelSteps] ?? f.step,
                f.sessions,
              ]),
            )}
          >
            <ol className="dash-funnel" role="list">
              {insights.funnel.map((f) => (
                <li key={f.step} className="dash-funnel-step">
                  <span className="dash-bar-name">
                    {t.funnelSteps[f.step as keyof typeof t.funnelSteps] ?? f.step}
                  </span>
                  <span className="dash-bar-track">
                    <span
                      className="dash-bar-fill"
                      style={{ inlineSize: `${(f.sessions / funnelMax) * 100}%` }}
                    />
                  </span>
                  <span className="dash-bar-value">{f.sessions.toLocaleString('en')}</span>
                </li>
              ))}
            </ol>
          </Block>

          <Block
            title={t.devices}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.devices, t.sessions],
              insights.devices.map((d) => [d.device, d.count]),
            )}
          >
            <BarList
              t={t}
              unit={t.sessions}
              nameHeader={t.devices}
              items={insights.devices.map((d) => ({ name: d.device, value: d.count }))}
            />
          </Block>

          <Block
            title={`${t.os} · ${t.browsers}`}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.os, t.sessions],
              [
                ...insights.os.map((o): (string | number)[] => [o.os, o.count]),
                ...insights.browsers.map((b): (string | number)[] => [b.browser, b.count]),
              ],
            )}
          >
            <BarList
              t={t}
              unit={t.sessions}
              nameHeader={t.os}
              items={[
                ...insights.os.map((o) => ({ name: o.os, value: o.count })),
                ...insights.browsers.map((b) => ({ name: b.browser, value: b.count })),
              ]}
            />
          </Block>

          <Block
            title={t.referrers}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.referrers, t.sessions],
              insights.referrers.map((r) => [r.ref, r.count]),
            )}
          >
            <BarList
              t={t}
              unit={t.sessions}
              nameHeader={t.referrers}
              items={insights.referrers.map((r) => ({ name: r.ref, value: r.count }))}
            />
          </Block>

          <Block
            title={t.locales}
            tableLabel={t.viewAsTable}
            table={tableOf(
              [t.locales, t.sessions],
              insights.locales.map((l) => [l.locale, l.count]),
            )}
          >
            <BarList
              t={t}
              unit={t.sessions}
              nameHeader={t.locales}
              items={insights.locales.map((l) => ({ name: l.locale, value: l.count }))}
            />
          </Block>
        </div>
      )}
    </div>
  );
}
