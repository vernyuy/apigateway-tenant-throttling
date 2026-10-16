import { useState } from 'react';
import type { DailyUsage } from '../../api';
import { columnPath, compact, niceMax, useWidth } from './chart-utils';

const H = 180;
const PAD = { top: 18, right: 4, bottom: 22, left: 36 };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

/** Requests per day for one company. A single series, so the card title names it and there is no legend. */
export function UsageChart({ days }: { days: DailyUsage[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const top = niceMax(Math.max(1, ...days.map((d) => d.used)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.min(24, slot * 0.6);
  const baseline = PAD.top + plotH;
  const scale = (v: number) => (v / top) * plotH;
  const peak = days.reduce((best, d, i) => (d.used > (days[best]?.used ?? -1) ? i : best), 0);

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Requests per day, last 7 days">
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={baseline - scale(t)} y2={baseline - scale(t)} />
            <text className="tick" x={PAD.left - 6} y={baseline - scale(t) + 3} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        <line className="axis" x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} />

        {days.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = scale(d.used);
          return (
            <g key={d.date} className={hover === i ? 'col hovered' : 'col'}>
              {h >= 0.5 && <path className="seg seg-series" d={columnPath(x, baseline - h, barW, h)} />}
              {/* Label only the peak day; the tooltip and table carry the rest. */}
              {i === peak && d.used > 0 && (
                <text className="value-label" x={x + barW / 2} y={baseline - h - 5} textAnchor="middle">
                  {compact(d.used)}
                </text>
              )}
              <text className="tick" x={x + barW / 2} y={H - 6} textAnchor="middle">
                {dayLabel(d.date)}
              </text>
              <rect
                className="hit"
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                tabIndex={0}
                aria-label={`${d.date}: ${d.used} requests, ${d.remaining} remaining`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null && days[hover] && (
        <div className="tooltip" style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%` }}>
          <div className="tooltip-title">{days[hover]!.date}</div>
          <div className="tooltip-row">
            <span className="line-key series" aria-hidden="true" />
            <strong>{days[hover]!.used.toLocaleString()}</strong>
            <span className="muted">requests</span>
          </div>
          <div className="tooltip-row">
            <strong>{days[hover]!.remaining.toLocaleString()}</strong>
            <span className="muted">of daily quota left</span>
          </div>
        </div>
      )}
    </div>
  );
}
