"use client";
import { useCallback, useId, useState } from "react";
import { fmt, fmtWords } from "./lib";

type Props = {
  series: [number, number][];
  claimed: number;
  unit: string | null;
  matchedYear: number | null;
  label: string;
};

const W = 640;
const H = 290;
const L = 68;
const R = 32;
const T = 24;
const B = 36;
const CHART_WIDTH = W - L - R; // 540px

export default function Chart({ series, claimed, unit, matchedYear, label }: Props) {
  const [hv, setHv] = useState<number | null>(null);
  const gradId = useId();

  const pts = [...series].sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;

  const xs = pts.map((p) => p[0]);
  const ys = [...pts.map((p) => p[1]), claimed];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const pad = (y1 - y0 || 1) * 0.1;
  y0 -= pad;
  y1 += pad;

  const X = useCallback(
    (x: number) => L + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * CHART_WIDTH,
    [x0, x1]
  );
  const Y = useCallback(
    (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B),
    [y0, y1]
  );

  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${X(pts[pts.length - 1][0])} ${H - B} L${X(pts[0][0])} ${H - B} Z`;

  const ticks = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
  const mid = pts.length > 2 ? pts[Math.floor(pts.length / 2)][0] : null;
  const last = pts[pts.length - 1];
  const matched = pts.find((p) => p[0] === matchedYear);
  const h = hv !== null ? pts[hv] : null;

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(X(p[0]) - vx) < Math.abs(X(pts[best][0]) - vx)) best = i;
    });
    setHv(best);
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHv((prev) => (prev === null || prev <= 0 ? pts.length - 1 : prev - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHv((prev) => (prev === null || prev >= pts.length - 1 ? 0 : prev + 1));
    } else if (e.key === "Escape") {
      setHv(null);
    }
  }

  // Tooltip coordinates & sizing
  const hX = h ? X(h[0]) : 0;
  const hY = h ? Y(h[1]) : 0;
  const pillW = 136;
  const pillH = 50;
  const pillX = hX > W - 150 ? hX - pillW - 14 : hX + 14;
  const pillY = Math.max(T + 4, Math.min(hY - pillH / 2, H - B - pillH - 4));

  return (
    <svg
      className={`chart c-${label}`}
      viewBox={`0 0 ${W} ${H}`}
      role="region"
      tabIndex={0}
      aria-label={`Time series chart from ${x0} to ${x1}. Use Left and Right arrow keys to navigate yearly figures. Showing latest official figure ${fmtWords(last[1], unit)} compared to claimed ${fmtWords(claimed, unit)}.`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHv(null)}
      onKeyDown={handleKeyDown}
    >
      <defs>
        {/* Soft Linear Gradient for Area Fill */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.28" />
          <stop offset="75%" stopColor="var(--blue)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid horizontal lines */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="gl" x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} />
          <text className="ax" x={L - 8} y={Y(t) + 4} textAnchor="end">
            {fmt(t, unit)}
          </text>
        </g>
      ))}

      {/* Axis Year Labels */}
      <text className="ax" x={X(x0)} y={H - 12} textAnchor="start">
        {x0}
      </text>
      {mid !== null && (
        <text className="ax" x={X(mid)} y={H - 12} textAnchor="middle">
          {mid}
        </text>
      )}
      {x1 !== x0 && (
        <text className="ax" x={X(x1)} y={H - 12} textAnchor="end">
          {x1}
        </text>
      )}

      {/* Gradient Area Fill with smooth fade-in */}
      <path className="area" d={area} fill={`url(#${gradId})`} />

      {/* Main Trajectory Line with normalized pathLength animation */}
      <path
        className="ser"
        pathLength="100"
        d={line}
      />

      {/* Claimed Comparison Line & Tag with smooth entrance */}
      <line
        className="claimed"
        x1={L}
        x2={W - R}
        y1={Y(claimed)}
        y2={Y(claimed)}
      />
      <text
        className="ctag"
        x={W - R}
        y={Y(claimed) - 8}
        textAnchor="end"
      >
        claimed {fmtWords(claimed, unit)}
      </text>

      {/* Latest Official Point */}
      <circle
        className="dot"
        cx={X(last[0])}
        cy={Y(last[1])}
        r={5}
      />

      {/* Matched Year Point & Pulsing Target Ring */}
      {matched && (
        <circle
          className="ring"
          cx={X(matched[0])}
          cy={Y(matched[1])}
          r={9}
        />
      )}

      {/* Interactive Tooltip & Crosshair */}
      {h && (
        <g className="hov" aria-hidden="true">
          <line className="hov-line" x1={hX} x2={hX} y1={T} y2={H - B} />
          <circle className="hov-circle" cx={hX} cy={hY} r={6} />
          <rect className="hov-pill" x={pillX} y={pillY} width={pillW} height={pillH} rx={8} />
          <text className="hov-text-year" x={pillX + 12} y={pillY + 19}>
            Year {h[0]}
          </text>
          <text className="hov-text-val" x={pillX + 12} y={pillY + 37}>
            {fmtWords(h[1], unit)}
          </text>
        </g>
      )}
    </svg>
  );
}
