import { useState } from 'react';
import { OUTCOMES, type Bucket } from '../../hooks/useTraffic';
import { OUTCOME_LABEL } from '../ui';
import { columnPath, compact, niceMax, useWidth } from './chart-utils';

const H = 160;
const PAD = { top: 8, right: 4, bottom: 20, left: 30 };
const GAP = 2;

interface Props {
  buckets: Bucket[];
  /** Shared across companies so their charts can be compared honestly. */
  yMax: number;
  label: string;
}

/** Requests per second, stacked by outcome. Status colours only: good, warning, critical, muted. */
export function TrafficChart({ buckets, yMax, label }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  const top = niceMax(yMax);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / buckets.length;
  // About four labels on the time axis, whatever the run length.
  const tickStep = buckets.length <= 20 ? 5 : buckets.length <= 60 ? 15 : 30;
  const barW = Math.min(24, slot * 0.68);
  const scale = (v: number) => (v / top) * plotH;
  const baseline = PAD.top + plotH;
  const ticks = [0, top / 2, top];

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={baseline - scale(t)} y2={baseline - scale(t)} />
            <text className="tick" x={PAD.left - 6} y={baseline - scale(t) + 3} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        <line className="axis" x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} />

        {buckets.map((bucket, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          let cursor = baseline;
          const segments = OUTCOMES.filter((o) => bucket[o] > 0);
          return (
            <g key={i} className={hover === i ? 'col hovered' : 'col'}>
              {segments.map((outcome, s) => {
                let h = scale(bucket[outcome]);
                if (s > 0) {
                  cursor -= GAP; // surface gap between stacked segments
                  h = Math.max(0, h - GAP);
                }
                const y = cursor - h;
                cursor = y;
                if (h < 0.5) return null;
                return s === segments.length - 1 ? (
                  <path key={outcome} className={`seg seg-${outcome}`} d={columnPath(x, y, barW, h)} />
                ) : (
                  <rect key={outcome} className={`seg seg-${outcome}`} x={x} y={y} width={barW} height={h} />
                );
              })}
              {/* Hit target: the whole column, bigger than the painted mark. */}
              <rect
                className="hit"
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                tabIndex={0}
                aria-label={`Second ${i}: ${OUTCOMES.map((o) => `${bucket[o]} ${OUTCOME_LABEL[o]}`).join(', ')}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}

        {Array.from({ length: Math.ceil(buckets.length / tickStep) }, (_, i) => i * tickStep).map((s) => (
          <text key={s} className="tick" x={PAD.left + s * slot + slot / 2} y={H - 6} textAnchor="middle">
            {s}s
          </text>
        ))}
      </svg>

      {hover !== null && buckets[hover] && (
        <div className="tooltip" style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%` }}>
          <div className="tooltip-title">
            {hover}s to {hover + 1}s
          </div>
          {OUTCOMES.filter((o) => o !== 'other' || buckets[hover]!.other > 0).map((o) => (
            <div key={o} className="tooltip-row">
              <span className={`line-key outcome-${o}`} aria-hidden="true" />
              <strong>{buckets[hover]![o]}</strong>
              <span className="muted">{OUTCOME_LABEL[o]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
