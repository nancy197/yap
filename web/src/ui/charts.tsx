// Small SVG chart kit following the dataviz method: thin marks, recessive grid, one axis, legend for >= 2
// series plus direct end labels, crosshair + tooltip on lines, per-cell tooltip on matrices, text in ink
// tokens (never the series color). Colors come from CSS tokens (--series-N, --status-*), validated light/dark.
import { useMemo, useRef, useState, type ReactNode } from 'react';

export type Series = { name: string; color: string; points: [number, number][] };

function ticks(min: number, max: number, n = 4) {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = (span / n) / step;
  const s = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const out: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(+v.toFixed(10));
  return out;
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name}>
          <i style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} className={i.dashed ? 'dash' : ''} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

export function LineChart({
  series,
  height = 260,
  xLabel,
  yFormat = (v) => String(v),
  xFormat = (v) => String(v),
  yDomain,
  zeroLine,
  annotations = [],
  dashed = [],
  width: W = 640,
}: {
  series: Series[];
  height?: number;
  xLabel?: string;
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  yDomain?: [number, number];
  zeroLine?: boolean;
  annotations?: { x: number; label: string }[];
  dashed?: string[];
  width?: number;
}) {
  const pad = { l: 52, r: 150, t: 12, b: 34 };
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = yDomain ?? [Math.min(0, ...ys), Math.max(...ys) * 1.05];
  const X = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const allX = useMemo(() => [...new Set(xs)].sort((a, b) => a - b), [series]); // eslint-disable-line react-hooks/exhaustive-deps

  // Direct end labels, nudged apart so they never collide.
  const ends = series
    .map((s) => ({ s, y: Y(s.points[s.points.length - 1][1]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  // keep the stack inside the plot: if it ran past the bottom, shift it up
  const overflow = ends.length ? ends[ends.length - 1].y - (height - pad.b - 4) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = allX[0];
    for (const x of allX) if (Math.abs(X(x) - px) < Math.abs(X(best) - px)) best = x;
    setHover(best);
  };
  const hx = hover != null ? X(hover) : 0;
  return (
    <div className="chart">
      <Legend items={series.map((s) => ({ name: s.name, color: s.color, dashed: dashed.includes(s.name) }))} />
      <div className="chart-plot">
        <svg ref={ref} viewBox={`0 0 ${W} ${height}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          {ticks(y0, y1).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} className={t === 0 && zeroLine ? 'axis' : 'grid'} />
              <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" className="tick">{yFormat(t)}</text>
            </g>
          ))}
          {ticks(x0, x1, 5).map((t) => (
            <text key={t} x={X(t)} y={height - pad.b + 16} textAnchor="middle" className="tick">{xFormat(t)}</text>
          ))}
          {xLabel && <text x={(pad.l + W - pad.r) / 2} y={height - 4} textAnchor="middle" className="tick">{xLabel}</text>}
          {annotations.map((a) => (
            <g key={a.label}>
              <line x1={X(a.x)} x2={X(a.x)} y1={pad.t} y2={height - pad.b} className="annot" />
              <text x={X(a.x) + 4} y={pad.t + 10} className="tick">{a.label}</text>
            </g>
          ))}
          {series.map((s) => (
            <path
              key={s.name}
              d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={dashed.includes(s.name) ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {ends.map(({ s, y }) => (
            <g key={s.name}>
              <circle cx={X(s.points[s.points.length - 1][0])} cy={Y(s.points[s.points.length - 1][1])} r={4} fill={s.color} className="ring" />
              <text x={W - pad.r + 10} y={y + 4} className="endlabel">{s.name} {yFormat(s.points[s.points.length - 1][1])}</text>
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={hx} x2={hx} y1={pad.t} y2={height - pad.b} className="cross" />
              {series.map((s) => {
                const p = s.points.find((q) => q[0] === hover);
                return p ? <circle key={s.name} cx={hx} cy={Y(p[1])} r={4.5} fill={s.color} className="ring" /> : null;
              })}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="tip" style={{ left: `${(hx / W) * 100}%` }}>
            <b>{xLabel ? `${xLabel}: ` : ''}{xFormat(hover)}</b>
            {series
              .map((s) => ({ s, p: s.points.find((q) => q[0] === hover) }))
              .filter((r) => r.p)
              .sort((a, b) => b.p![1] - a.p![1])
              .map(({ s, p }) => (
                <div key={s.name}><i style={{ background: s.color }} />{s.name}<span>{yFormat(p![1])}</span></div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}


/** Vertical bars with a per-bar tooltip; bars anchored to the baseline with rounded data ends. */
export function Bars({ data, height = 160, format = (v: number) => String(v), color = 'var(--accent)' }: { data: { label: string; value: number; color?: string; note?: string }[]; height?: number; format?: (v: number) => string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1e-9);
  return (
    <div className="chart" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
        {data.map((d, i) => (
          <div key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
            <div style={{ width: '100%', height: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? color, borderRadius: '4px 4px 0 0', opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      {hover != null && (
        <div className="tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: -8 }}>
          <b>{data[hover]!.label}</b>
          <div><span style={{ marginLeft: 0 }}>{format(data[hover]!.value)}</span></div>
          {data[hover]!.note && <div className="muted">{data[hover]!.note}</div>}
        </div>
      )}
    </div>
  );
}
