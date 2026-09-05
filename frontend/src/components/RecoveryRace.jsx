import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

/*
 * "TRACE gets more back for the same effort", as a race rather than a frontier.
 *
 * The underlying data is the same cumulative curve the old chart plotted: each
 * system spends its interventions one at a time, best-value cases first, and
 * the curve is what it has recovered by then. A cumulative best-value-density
 * frontier is not a thing anyone reads off a chart in five seconds, so this
 * says the same thing as a race: both lines start together, one pulls ahead,
 * and the point where the gap is widest is called out in words and rupees.
 *
 * Both systems are compared only over the interventions they BOTH spent, which
 * is what "for the same effort" has to mean for the comparison to be fair.
 */

/** Reshape the two frontier series into a comparable, clipped pair. */
function buildRace(frontier) {
  const T = frontier?.TRACE || [];
  const B = frontier?.BASELINE || [];
  if (T.length < 2 || B.length < 2) return null;

  // The honest domain is the effort both systems actually spent. Running TRACE
  // out to its own 368th intervention while the baseline stops at 250 would be
  // comparing more effort against less.
  const maxX = Math.min(T[T.length - 1].interventions, B[B.length - 1].interventions);
  if (maxX <= 0) return null;

  const clip = (series) => {
    const out = [];
    let lastY = 0;
    for (const p of series) {
      if (p.interventions > maxX) break;
      lastY = p.revenue_recovered;
      out.push({ x: p.interventions, y: p.revenue_recovered });
    }
    if (!out.length) return null;
    // Carry the last known total out to the shared end of the domain, so both
    // lines finish on the same x.
    if (out[out.length - 1].x < maxX) out.push({ x: maxX, y: lastY });
    return out;
  };

  const trace = clip(T);
  const baseline = clip(B);
  if (!trace || !baseline) return null;

  const maxY = Math.max(trace[trace.length - 1].y, baseline[baseline.length - 1].y);
  if (!(maxY > 0)) return null;

  // Widest lead. Both series only ever step up, so the gap can only peak at one
  // of TRACE's own steps -- walking the baseline alongside is enough.
  let gap = { x: trace[0].x, trace: trace[0].y, baseline: baseline[0].y, delta: 0 };
  let bi = 0;
  for (const p of trace) {
    while (bi + 1 < baseline.length && baseline[bi + 1].x <= p.x) bi += 1;
    const delta = p.y - baseline[bi].y;
    if (delta > gap.delta) gap = { x: p.x, trace: p.y, baseline: baseline[bi].y, delta };
  }

  return { maxX, maxY, trace, baseline, gap };
}

/** Step-after polyline points in the SVG's normalised 0-1000 space. */
function stepPath(points, maxX, maxY) {
  const px = (x) => (x / maxX) * 1000;
  const py = (y) => 1000 - (y / maxY) * 1000;
  const out = [];
  points.forEach((p, i) => {
    if (i > 0) out.push(`${px(p.x)},${py(points[i - 1].y)}`);
    out.push(`${px(p.x)},${py(p.y)}`);
  });
  return out.join(" ");
}

const GRID = [0, 0.25, 0.5, 0.75, 1];

export function RecoveryRace({ frontier }) {
  const [runId, setRunId] = useState(0);
  const race = useMemo(() => buildRace(frontier), [frontier]);
  if (!race) return null;

  const { maxX, maxY, trace, baseline, gap } = race;
  const gapLeft = (gap.x / maxX) * 100;
  const traceEnd = trace[trace.length - 1].y;
  const baselineEnd = baseline[baseline.length - 1].y;
  // A line that tops out sits its label half outside the plot; keep both
  // inside the box even when the two finish close together.
  const labelAt = (v) => `${Math.min(94, Math.max(6, (v / maxY) * 100))}%`;

  return (
    <div className="record overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pb-3 pt-5 sm:px-6">
        <div className="min-w-0">
          <div className="eyebrow text-graphite/60">/ same effort, more money back</div>
          <p className="wrap-prose mt-2 max-w-2xl text-sm leading-relaxed text-graphite/80">
            Both systems work the same batch of failed payments, spending one intervention at a
            time. The higher line has recovered more money for the same number of interventions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRunId((r) => r + 1)}
          className="eyebrow inline-flex shrink-0 items-center gap-2 rounded-xs border border-rule px-2.5 py-1.5 text-graphite/70 transition-colors hover:border-electric hover:text-electric"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2} />
          replay
        </button>
      </div>

      {/* ------------------------------------------------------------ plot */}
      <div className="px-4 sm:px-6">
        <div key={runId} className="relative h-64 sm:h-72">
          {/* Hairline grid, in HTML so the rules stay one pixel at any width. */}
          {GRID.map((g) => (
            <div
              key={g}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-rule"
              style={{ top: `${(1 - g) * 100}%` }}
            />
          ))}

          {/* The widest-lead marker sits behind the lines. */}
          <div
            aria-hidden="true"
            className="absolute bottom-0 top-0 border-l border-dashed border-graphite/45"
            style={{ left: `${gapLeft}%` }}
          />

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Revenue recovered against interventions spent. After ${gap.x} interventions TRACE had recovered ${formatCurrency(gap.trace)} against the baseline's ${formatCurrency(gap.baseline)}.`}
          >
            <polyline
              className="race-line"
              pathLength="1"
              points={stepPath(baseline, maxX, maxY)}
              fill="none"
              stroke="var(--color-graphite)"
              strokeOpacity="0.38"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
            <polyline
              className="race-line"
              pathLength="1"
              points={stepPath(trace, maxX, maxY)}
              fill="none"
              stroke="var(--color-approve)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>

          {/* The lead, drawn as a bracket between the two lines at its widest. */}
          <div
            aria-hidden="true"
            className="race-reveal absolute w-1 border-y-2 border-l-2 border-approve-deep"
            style={{
              left: `${gapLeft}%`,
              bottom: `${(gap.baseline / maxY) * 100}%`,
              height: `${((gap.trace - gap.baseline) / maxY) * 100}%`,
            }}
          />

          {/* End-of-race labels, as HTML so type never scales with the plot. */}
          <div
            className="race-reveal absolute right-0 -translate-y-1/2 text-right"
            style={{ bottom: labelAt(traceEnd) }}
          >
            <div className="eyebrow text-approve-deep">TRACE</div>
            <div className="tnum text-sm font-semibold text-approve-deep">
              {formatCompactCurrency(traceEnd)}
            </div>
          </div>
          <div
            className="race-reveal absolute right-0 -translate-y-1/2 text-right"
            style={{ bottom: labelAt(baselineEnd) }}
          >
            <div className="eyebrow text-graphite/70">Baseline</div>
            <div className="tnum text-sm font-semibold text-graphite/70">
              {formatCompactCurrency(baselineEnd)}
            </div>
          </div>
        </div>

        {/* x axis, in words rather than a bare number line. */}
        <div className="mt-2 flex items-baseline justify-between border-t border-graphite/25 pt-2">
          <span className="tnum text-[11px] text-graphite/70">0</span>
          <span className="eyebrow text-graphite/60">interventions spent →</span>
          <span className="tnum text-[11px] text-graphite/70">{maxX}</span>
        </div>
      </div>

      {/* -------------------------------------------------------- the callout */}
      <div className="race-reveal m-4 rounded-xs border border-approve/40 bg-approve-soft p-4 sm:m-6">
        <div className="eyebrow text-approve-deep">/ widest lead</div>
        <p className="wrap-prose mt-2 text-sm leading-relaxed text-graphite/85">
          After <span className="tnum font-semibold text-graphite">{gap.x}</span> interventions —
          the same number for both — TRACE had recovered{" "}
          <span className="tnum font-semibold text-approve-deep">{formatCurrency(gap.trace)}</span>{" "}
          against the baseline&apos;s{" "}
          <span className="tnum font-semibold text-graphite/80">
            {formatCurrency(gap.baseline)}
          </span>
          . That is{" "}
          <span className="tnum font-semibold text-approve-deep">
            {formatCurrency(gap.delta)}
          </span>{" "}
          more money back for exactly the same amount of work.
        </p>
      </div>
    </div>
  );
}
