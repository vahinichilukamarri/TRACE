import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "./useInView";

/*
 * The loop, drawn as a loop, and played on its own.
 *
 * An IntersectionObserver starts it the first time it is seen; from there it is
 * driven purely by elapsed time. It reads nothing about scroll position, pins
 * nothing, and installs no scroll listener -- where it sits on the page and how
 * fast the reader got there make no difference to it.
 *
 * A token travels the seven stations; each completed circuit advances the case
 * context the way app/engine.py::advance_case_state does. The fourth pass exits
 * to the centre, because MAX_REASSESSMENT_ITERATIONS is a real bound and the
 * diagram has to terminate rather than spin forever. It plays once and stops.
 */

const STATIONS = [
  ["Classify", "Map the failure to one of five types."],
  ["Price", "Recovery probability × amount at risk."],
  ["Choose", "One action from the closed set of six."],
  ["Check", "Nine deterministic rules adjudicate it."],
  ["Execute", "Only what policy cleared."],
  ["Observe", "Record the outcome against the case."],
  ["Reassess", "Advance the context, then decide again."],
];

/* Mirrors advance_case_state: attempts spend, opportunities burn, time moves. */
const PASSES = [
  { action: "Send recovery link", outcome: "Sent, not paid", attempts: 1, remaining: 2, elapsed: "48 min" },
  { action: "Retry payment", outcome: "Declined again", attempts: 2, remaining: 1, elapsed: "1 h 39 min" },
  { action: "Wait and reassess", outcome: "Still unpaid", attempts: 2, remaining: 1, elapsed: "3 h 52 min" },
  { action: "Stop recovery", outcome: "Iteration bound reached", attempts: 2, remaining: 1, elapsed: "4 h 26 min" },
];

const CX = 300;
const CY = 210;
const RX = 212;
const RY = 148;

const STEP_MS = 300; // one station
const EXIT_MS = 700; // the peel-off into the terminal state
const STEPS = PASSES.length * STATIONS.length;
const TOTAL_MS = STEPS * STEP_MS + EXIT_MS;
const LOOP_END = (STEPS * STEP_MS) / TOTAL_MS;

const TAU = Math.PI * 2;
const angleAt = (i) => -Math.PI / 2 + (i * TAU) / STATIONS.length;
const pointAt = (a) => [CX + RX * Math.cos(a), CY + RY * Math.sin(a)];
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function RecoveryLoop() {
  const reduced = usePrefersReducedMotion();
  const [wrapRef, seen] = useInView();
  const tokenRef = useRef(null);
  const progressRef = useRef(null);

  const [active, setActive] = useState(reduced ? -1 : 0);
  const [pass, setPass] = useState(reduced ? PASSES.length - 1 : 0);
  const [done, setDone] = useState(reduced);

  useEffect(() => {
    if (reduced || !seen) return undefined;

    let raf = 0;
    let start = 0;
    // Mirrors of the React state, so a frame can decide whether a re-render is
    // even warranted. React renders ~28 times across the run, not 60 times a second.
    let lastStation = -2;
    let lastPass = -1;
    let lastDone = false;

    const place = (x, y) => {
      const node = tokenRef.current;
      if (node) node.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };

    const frame = (now) => {
      if (!start) start = now;
      const p = clamp01((now - start) / TOTAL_MS);

      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      }

      if (p <= LOOP_END) {
        const stepFloat = (p / LOOP_END) * STEPS;
        const passIdx = Math.min(PASSES.length - 1, Math.floor(stepFloat / STATIONS.length));
        const stationFloat = stepFloat % STATIONS.length;
        const stationIdx = Math.min(STATIONS.length - 1, Math.floor(stationFloat));

        const [x, y] = pointAt(angleAt(stationFloat));
        place(x, y);

        if (stationIdx !== lastStation) { lastStation = stationIdx; setActive(stationIdx); }
        if (passIdx !== lastPass) { lastPass = passIdx; setPass(passIdx); }
      } else {
        // Peel off the ring into the terminal state at the centre.
        const e = easeInOut(clamp01((p - LOOP_END) / (1 - LOOP_END)));
        const [sx, sy] = pointAt(angleAt(0));
        place(sx + (CX - sx) * e, sy + (CY - sy) * e);

        if (lastStation !== -1) { lastStation = -1; setActive(-1); }
        if (lastPass !== PASSES.length - 1) { lastPass = PASSES.length - 1; setPass(PASSES.length - 1); }
        const isDone = e > 0.75;
        if (isDone !== lastDone) { lastDone = isDone; setDone(isDone); }
      }

      if (p < 1) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, seen]);

  const current = PASSES[pass];

  return (
    <div ref={wrapRef}>
      {/* Which iteration, and how far through the run. */}
      {!reduced && (
        <div className="mb-8 flex items-center gap-5">
          <div className="flex gap-3">
            {PASSES.map((_, i) => (
              <span
                key={i}
                className={`tnum text-xs transition-colors duration-300 ${
                  i === pass ? "font-semibold text-graphite" : "text-graphite/30"
                }`}
              >
                ({String(i + 1).padStart(2, "0")})
              </span>
            ))}
          </div>
          <span className="h-px flex-1 overflow-hidden bg-rule">
            <span
              ref={progressRef}
              className="block h-px w-full origin-left bg-graphite"
              style={{ transform: "scaleX(0)" }}
            />
          </span>
          <span className="hidden text-xs text-graphite/40 sm:inline">
            {done ? "Loop closed" : "Running"}
          </span>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* --------------------------------------------- ring (sm and up) */}
        <div className="hidden sm:block">
          <svg
            viewBox="0 0 600 420"
            className="w-full"
            role="img"
            aria-label="The recovery loop: classify, price, choose, check, execute, observe, reassess — repeating until a terminal state or the four-iteration bound."
          >
            <defs>
              <linearGradient id="loop-token" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-approve)" />
                <stop offset="100%" stopColor="var(--color-approve-deep)" />
              </linearGradient>
            </defs>

            <ellipse
              cx={CX}
              cy={CY}
              rx={RX}
              ry={RY}
              fill="none"
              stroke="var(--color-rule)"
              strokeWidth="1.5"
              strokeDasharray="3 6"
            />

            {/* Terminal state. Cream, never near-black: a dark disc on a cream
                card reads as a hole punched in the page. */}
            <g>
              <circle
                cx={CX}
                cy={CY}
                r="52"
                fill={done ? "var(--color-paper-alt)" : "transparent"}
                stroke={done ? "var(--color-graphite)" : "var(--color-rule)"}
                strokeWidth={done ? 2 : 1.5}
                className="transition-all duration-500"
              />
              <text
                x={CX}
                y={CY - 4}
                textAnchor="middle"
                className="text-[13px] font-semibold transition-opacity duration-500"
                fill="var(--color-graphite)"
                opacity={done ? 1 : 0.45}
              >
                STOP
              </text>
              <text
                x={CX}
                y={CY + 14}
                textAnchor="middle"
                className="text-[10px]"
                fill="var(--color-graphite)"
                opacity={done ? 0.7 : 0.35}
              >
                bound: 4
              </text>
            </g>

            {STATIONS.map(([name], i) => {
              const a = angleAt(i);
              const [x, y] = pointAt(a);
              const isActive = i === active;
              const passed = active === -1 || i < active;
              return (
                <g key={name}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 9 : 6}
                    fill={isActive || passed ? "var(--color-approve)" : "var(--color-paper)"}
                    stroke={isActive || passed ? "var(--color-approve)" : "var(--color-rule)"}
                    strokeWidth="1.5"
                    className="transition-all duration-300"
                  />
                  <text
                    x={x + Math.cos(a) * 30}
                    y={y + Math.sin(a) * 26 + 4}
                    textAnchor={
                      Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end"
                    }
                    className="text-[13px] transition-all duration-300"
                    fill="var(--color-graphite)"
                    fontWeight={isActive ? 600 : 400}
                    opacity={isActive ? 1 : 0.55}
                  >
                    {name}
                  </text>
                </g>
              );
            })}

            {/* The token. Moved imperatively; never re-rendered by React. The
                rim keeps it reading as a ball on any fill it crosses. */}
            <g
              ref={tokenRef}
              transform={reduced ? `translate(${CX} ${CY})` : `translate(${CX} ${CY - RY})`}
            >
              <circle r="13" fill="url(#loop-token)" opacity="0.16" />
              <circle
                r="6.5"
                fill="url(#loop-token)"
                stroke="var(--color-paper)"
                strokeWidth="1.5"
              />
            </g>
          </svg>
        </div>

        {/* --------------------------------------------- rail (mobile) */}
        <ol className="divide-y divide-rule border-y border-rule sm:hidden">
          {STATIONS.map(([name, detail], i) => {
            const isActive = i === active;
            return (
              <li key={name} className="flex gap-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300 ${
                    isActive || active === -1 || i < active ? "bg-approve" : "bg-rule"
                  }`}
                />
                <span>
                  <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                    {name}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-graphite/60">
                    {detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* --------------------------------------------- state readout */}
        <div className="self-center">
          <div className="rounded-sm border border-rule bg-paper-hi p-5">
            <div className="flex items-baseline justify-between border-b border-rule pb-3">
              <span className="text-sm font-medium">Case context</span>
              <span className="tnum text-xs text-graphite/50">
                iteration {pass + 1} of {PASSES.length}
              </span>
            </div>

            <dl className="mt-3 space-y-2.5 text-sm">
              {[
                ["Action taken", current.action],
                ["Outcome", current.outcome],
                ["Attempts spent", String(current.attempts)],
                ["Opportunities left", String(current.remaining)],
                ["Time since failure", current.elapsed],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-graphite/55">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div
              className={`mt-4 border-t-[3px] border-double border-graphite pt-3 text-sm transition-opacity duration-500 ${
                done ? "opacity-100" : "opacity-40"
              }`}
            >
              <span className="font-medium">
                {done ? "Stopped — bound reached" : "Loop running"}
              </span>
              <p className="mt-1 leading-relaxed text-graphite/60">
                {done
                  ? "Four iterations without recovery. The loop force-stops itself rather than continuing to spend."
                  : "Every pass changes the context, so the next decision is made against different facts."}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-graphite/55">
            The loop can also exit early — recovered, escalated to a person, or stopped because the
            recovery window closed.
          </p>
        </div>
      </div>

      {/* Reduced motion gets the four passes as a table instead of a run, so
          nothing the animation would have shown is lost. */}
      {reduced && (
        <table className="mt-8 w-full max-w-[46rem] border-collapse text-left">
          <caption className="sr-only">Case context after each loop iteration</caption>
          <thead>
            <tr>
              {["Iteration", "Action taken", "Outcome", "Attempts", "Elapsed"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-rule pb-2 pr-6 text-xs font-medium text-graphite/50 last:pr-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {PASSES.map((p, i) => (
              <tr key={p.action}>
                <td className="tnum py-3 pr-6 text-sm text-graphite/40">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="py-3 pr-6 text-sm">{p.action}</td>
                <td className="py-3 pr-6 text-sm text-graphite/65">{p.outcome}</td>
                <td className="tnum py-3 pr-6 text-sm">{p.attempts}</td>
                <td className="tnum py-3 text-sm">{p.elapsed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
