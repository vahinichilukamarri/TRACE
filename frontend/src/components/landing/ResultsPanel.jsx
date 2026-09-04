import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useCountUp, useInView, usePrefersReducedMotion } from "./useInView";

/*
 * Measured results, read from the running service when it answers.
 *
 * The fallback figures are the seed-42 benchmark, not decoration — if the fetch
 * fails the page still states real numbers, and the provenance line says which
 * of the two the reader is looking at. Quietly showing stale numbers as live
 * would be the one dishonest thing this page could do.
 */

const FALLBACK = {
  live: false,
  TRACE: { recovered: 75, revenue: 270759, rate: 0.25, perIntervention: 873, avoided: 98 },
  BASELINE: { recovered: 61, revenue: 190784, rate: 0.2, perIntervention: 766, avoided: 43 },
};

const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const ROWS = [
  { key: "recovered", label: "Transactions recovered", fmt: (n) => Math.round(n).toString() },
  { key: "revenue", label: "Revenue recovered", fmt: inr },
  { key: "rate", label: "Recovery rate", fmt: (n) => `${(n * 100).toFixed(0)}%` },
  { key: "perIntervention", label: "Value per intervention", fmt: inr },
];

function shape(m) {
  return {
    recovered: m.transactions_recovered ?? 0,
    revenue: m.revenue_recovered ?? 0,
    rate: m.recovery_rate ?? 0,
    perIntervention: m.recovery_value_per_intervention ?? 0,
    avoided: m.interventions_avoided ?? 0,
  };
}

function Row({ row, trace, base, active, reduced, delay }) {
  const value = useCountUp(trace, active, { reduced, duration: 1000 });
  const max = Math.max(trace, base) || 1;
  const traceW = active ? (trace / max) * 100 : 0;
  const baseW = active ? (base / max) * 100 : 0;
  const better = trace > base;

  return (
    <div className="border-t border-rule py-5 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="text-sm text-graphite/65">{row.label}</span>
        <span className="tnum text-xl font-semibold sm:text-2xl">{row.fmt(value)}</span>
      </div>

      {/* Two bars racing on a shared scale — the gap is the whole argument. */}
      <div className="mt-3 space-y-1.5">
        {[
          ["TRACE", traceW, trace, true],
          ["Baseline", baseW, base, false],
        ].map(([name, w, v, isTrace]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-graphite/50">{name}</span>
            <span className="relative h-3 flex-1 overflow-hidden rounded-xs bg-rule/40">
              <span
                className={`absolute inset-y-0 left-0 rounded-xs ${
                  isTrace
                    ? "bg-gradient-to-r from-approve to-approve-deep"
                    : "bg-graphite/25"
                }`}
                style={{
                  width: `${w}%`,
                  transition: reduced
                    ? "none"
                    : `width 1000ms cubic-bezier(0.22,1,0.36,1) ${delay + (isTrace ? 0 : 120)}ms`,
                }}
              />
            </span>
            <span className="tnum w-24 shrink-0 text-right text-sm text-graphite/60">
              {row.fmt(v)}
            </span>
          </div>
        ))}
      </div>

      {better && (
        <p className="mt-2 text-xs text-approve">
          {row.key === "rate"
            ? `+${((trace - base) * 100).toFixed(0)} percentage points`
            : `+${row.fmt(trace - base)}`}
        </p>
      )}
    </div>
  );
}

export function ResultsPanel() {
  const reduced = usePrefersReducedMotion();
  const [ref, seen] = useInView();
  const [data, setData] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api
      .getComparison()
      .then((res) => {
        if (cancelled || !res?.TRACE || !res?.BASELINE) return;
        setData({
          live: true,
          runId: res.eval_run_id,
          TRACE: shape(res.TRACE),
          BASELINE: shape(res.BASELINE),
        });
      })
      .catch(() => {
        /* Service not reachable from a static host — the stated figures stand. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const avoided = useCountUp(data.TRACE.avoided, seen, { reduced, duration: 1200 });
  const avoidedBase = useCountUp(data.BASELINE.avoided, seen, { reduced, duration: 1200 });

  return (
    <div ref={ref}>
      {/* The headline figure. The rest of the section explains it. */}
      <div className="rounded-sm border border-rule bg-paper-hi p-6 shadow-[0_1px_2px_rgba(20,22,26,0.04),0_16px_40px_-24px_rgba(20,22,26,0.3)] sm:p-8">
        <p className="text-sm text-graphite/55">Cases correctly never pursued</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="tnum bg-gradient-to-br from-approve to-approve-deep bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
            {Math.round(avoided)}
          </span>
          <span className="text-lg text-graphite/40">versus</span>
          <span className="tnum text-4xl font-semibold leading-none text-graphite/35 sm:text-5xl">
            {Math.round(avoidedBase)}
          </span>
          <span className="text-sm text-graphite/50">for the baseline</span>
        </div>
        <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.75] text-graphite/75">
          TRACE recovered more revenue while declining to touch{" "}
          <span className="tnum font-medium">{data.TRACE.avoided}</span> cases the baseline chased
          anyway. The thesis is not that the agent chases harder — it is that effort concentrates
          where it pays, and the clearest evidence of judgment is the work correctly left undone.
        </p>
      </div>

      <div className="mt-8">
        {ROWS.map((row, i) => (
          <Row
            key={row.key}
            row={row}
            trace={data.TRACE[row.key]}
            base={data.BASELINE[row.key]}
            active={seen}
            reduced={reduced}
            delay={i * 90}
          />
        ))}
      </div>

      <p className="mt-6 max-w-[64ch] text-sm leading-relaxed text-graphite/50">
        {data.live
          ? "Read live from the running service — the most recent completed evaluation run. "
          : "Stated figures from the seed-42 benchmark; the service was not reachable from this page. "}
        300 synthetic failed payments run through TRACE and through a fixed-rule baseline on
        identical data with matched per-case randomness, so differences come from the decisions
        made rather than luckier draws. Revenue figures are simulated financial outcomes from the
        evaluation harness, not real transactions. The recovery outcome model is hidden from the
        agent, which sees only case context — so the benchmark tests judgment rather than
        memorisation.
      </p>
    </div>
  );
}
