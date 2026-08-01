import { useEffect, useState } from 'react';

export interface MeasuredStrings {
  visitorsNow: string;
  pageviewsToday: string;
  topSection: string;
  avgScroll: string;
  noData: string;
}

/**
 * §06 teaser tiles. One insights fetch + a light live poll while mounted.
 * Renders em-dashes until data exists (unwired storage → designed empty state).
 */
export default function MeasuredTiles({ t }: { t: MeasuredStrings }) {
  const [live, setLive] = useState<number | null>(null);
  const [pvToday, setPvToday] = useState<number | null>(null);
  const [topSection, setTopSection] = useState<string | null>(null);
  const [avgScroll, setAvgScroll] = useState<number | null>(null);

  useEffect(() => {
    const poll = () =>
      fetch('/api/live')
        .then((r) => r.json())
        .then((d) => {
          setLive(d.live ?? 0);
          setPvToday(d.pvToday ?? 0);
        })
        .catch(() => {});
    poll();
    const id = window.setInterval(poll, 15_000);

    fetch('/api/insights?range=24h')
      .then((r) => r.json())
      .then((d) => {
        if (d.topSections?.length) setTopSection(d.topSections[0].section);
        if (d.scrollDepth?.length && d.uniques > 0) {
          const weighted = d.scrollDepth.reduce(
            (sum: number, p: { depth: number; sessions: number }) => sum + p.depth * p.sessions,
            0,
          );
          const total = d.scrollDepth.reduce(
            (sum: number, p: { sessions: number }) => sum + p.sessions,
            0,
          );
          if (total > 0) setAvgScroll(Math.round(weighted / total));
        }
      })
      .catch(() => {});

    return () => window.clearInterval(id);
  }, []);

  const loading = live === null && pvToday === null;

  const tiles = [
    { label: t.visitorsNow, value: live === null ? null : String(live), live: true },
    { label: t.pageviewsToday, value: pvToday === null ? null : String(pvToday) },
    { label: t.topSection, value: topSection },
    { label: t.avgScroll, value: avgScroll === null ? null : `${avgScroll}%` },
  ];

  return (
    <dl className="measured-tiles" aria-busy={loading}>
      {tiles.map((tile) => (
        <div key={tile.label} className="dash-tile">
          <dt className="dash-tile-label">
            {tile.live && <span className="dash-live-dot" aria-hidden="true" />}
            {tile.label}
          </dt>
          <dd className="dash-tile-value">
            {tile.value === null ? (
              loading ? (
                <span className="skeleton skeleton-title" aria-hidden="true" />
              ) : (
                <abbr title={t.noData}>-</abbr>
              )
            ) : (
              tile.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
