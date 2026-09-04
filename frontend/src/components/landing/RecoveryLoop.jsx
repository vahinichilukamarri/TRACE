import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useInView";
import { useTrackProgress } from "./useTrackProgress";

/*
 * The loop, drawn as a loop, and driven by the scroll.
 *
 * Structure is the pinned-chapter pattern: a tall track holds a sticky panel one
 * viewport high, so the panel stays fixed while the page scrolls THROUGH the
 * track, and scroll progress -- not a timer -- advances the sequence. The reader
 * sets the pace and can scrub back, which matters here because each pass changes
 * the case context and the whole point is to watch that change.
 *
 * A token travels the seven stations; each completed circuit advances the state
 * the way app/engine.py::advance_case_state does. The fourth pass exits to the
 * centre, because MAX_REASSESSMENT_ITERATIONS is a real bound and the diagram
 * has to terminate rather than spin forever.
 *
 * Progress comes from useTrackProgress, which samples position per frame while
 * the section is near the viewport rather than waiting on `scroll` events --
 * those go quiet during momentum and snap animations and strand the token.
 * The token transform is written straight onto the node; React re-renders only
 * when the integer station changes, ~28 times across the section, not per frame.
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

/* The last slice of the track is the exit to the terminal state, then a hold so
   the ending is readable before the pin releases. */
const LOOP_END = 0.86;

const TAU = Math.PI * 2;
const angleAt = (i) => -Math.PI / 2 + (i * TAU) / STATIONS.length;
const pointAt = (a) => [CX + RX * Math.cos(a), CY + RY * Math.sin(a)];
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* A pinned panel cannot be scrolled inside -- the scroll is spent driving the
   sequence -- so anything taller than the viewport is unreachable, not merely
   ugly. Below this floor the section refuses to pin and renders statically. */
const MIN_PIN_WIDTH = 768;
const MIN_PIN_HEIGHT = 700;
const fitsPin = () =>
  typeof window === "undefined" ||
  (window.innerWidth >= MIN_PIN_WIDTH && window.innerHeight >= MIN_PIN_HEIGHT);

export function RecoveryLoop() {
  const reduced = usePrefersReducedMotion();
  const trackRef = useRef(null);
  const tokenRef = useRef(null);
  const progressRef = useRef(null);
  const [roomToPin, setRoomToPin] = useState(fitsPin);

  // No pin means the finished state outright: no track, no scrubbing -- just the
  // loop as it ends, with every pass listed below it.
  const staticMode = reduced || !roomToPin;
  const [active, setActive] = useState(staticMode ? -1 : 0);
  const [pass, setPass] = useState(staticMode ? PASSES.length - 1 : 0);
  const [done, setDone] = useState(staticMode);

  useEffect(() => {
    const check = () => setRoomToPin(fitsPin());
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  // Landing on the end state whenever pinning is off, including a resize that
  // crosses the floor mid-section.
  useEffect(() => {
    if (!staticMode) return;
    setActive(-1);
    setPass(PASSES.length - 1);
    setDone(true);
  }, [staticMode]);

  // Mirrors of the React state, so a frame can decide whether a re-render is
  // even warranted without reading through a stale closure.
  const lastStation = useRef(-2);
  const lastPass = useRef(-1);
  const lastDone = useRef(false);

  useTrackProgress(trackRef, !staticMode, (p) => {
    const place = (x, y) => {
      const node = tokenRef.current;
      if (node) node.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };

    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
    }

    if (p <= LOOP_END) {
      const steps = PASSES.length * STATIONS.length;
      const stepFloat = clamp01(p / LOOP_END) * steps;
      const passIdx = Math.min(PASSES.length - 1, Math.floor(stepFloat / STATIONS.length));
      const stationFloat = stepFloat % STATIONS.length;
      const stationIdx = Math.min(STATIONS.length - 1, Math.floor(stationFloat));

      const [x, y] = pointAt(angleAt(stationFloat));
      place(x, y);

      if (stationIdx !== lastStation.current) { lastStation.current = stationIdx; setActive(stationIdx); }
      if (passIdx !== lastPass.current) { lastPass.current = passIdx; setPass(passIdx); }
      if (lastDone.current) { lastDone.current = false; setDone(false); }
    } else {
      // Peel off the ring into the terminal state at the centre.
      const e = easeInOut(clamp01((p - LOOP_END) / (1 - LOOP_END)));
      const [sx, sy] = pointAt(angleAt(0));
      place(sx + (CX - sx) * e, sy + (CY - sy) * e);

      if (lastStation.current !== -1) { lastStation.current = -1; setActive(-1); }
      if (lastPass.current !== PASSES.length - 1) { lastPass.current = PASSES.length - 1; setPass(PASSES.length - 1); }
      const isDone = e > 0.75;
      if (isDone !== lastDone.current) { lastDone.current = isDone; setDone(isDone); }
    }
  });

  const current = PASSES[pass];

  return (
    <div
      ref={trackRef}
      /* Four iterations plus the exit, over two viewports of scroll. */
      className={staticMode ? undefined : "relative h-[200vh]"}
    >
      <div
        className={
          staticMode ? undefined : "sticky top-0 flex min-h-svh flex-col justify-center py-10"
        }
      >
        {/* Chapter rail: which iteration, and how far through the section. */}
        {!staticMode && (
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
              {done ? "Loop closed" : "Scroll to advance the loop"}
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

              {/* Terminal state, at the centre the loop finally exits into. */}
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
                  className="text-[13px] font-semibold transition-colors duration-500"
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

              {/* The token. Moved imperatively; never re-rendered by React. With
                  motion reduced it starts where the sequence would have left it. */}
              <g
                ref={tokenRef}
                transform={staticMode ? `translate(${CX} ${CY})` : `translate(${CX} ${CY - RY})`}
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
            <div className="rounded-sm border border-rule bg-paper-hi p-5 shadow-[0_1px_2px_rgba(20,22,26,0.04),0_10px_24px_-14px_rgba(20,22,26,0.2)]">
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
              The loop can also exit early — recovered, escalated to a person, or stopped because
              the recovery window closed.
            </p>
          </div>
        </div>
      </div>

      {/* Reduced motion gets the four passes as a table instead of as a scrub,
          so nothing that the animation would have shown is lost. */}
      {staticMode && (
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
