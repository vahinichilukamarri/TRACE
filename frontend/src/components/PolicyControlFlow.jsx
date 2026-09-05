import { ArrowRight } from "lucide-react";

const OUTCOMES = [
  { label: "Approved", signal: "mint" },
  { label: "Blocked", signal: "red" },
  { label: "Flagged for review", signal: "amber" },
];

/* Verdict chips, in the three reserved colours and nothing else. */
const SIGNAL_TEXT = {
  mint: "text-signal-mint border-signal-mint/40 bg-signal-mint-dim",
  red: "text-signal-red border-signal-red/40 bg-signal-red-dim",
  amber: "text-signal-amber border-signal-amber/40 bg-signal-amber-dim",
};

export function PolicyControlFlow() {
  return (
    <div className="flex flex-col items-stretch gap-3 lg:flex-row">
      <FlowNode label="TRACE request" sub="Agent's proposed action + confidence" />
      <Connector />
      <FlowNode label="Policy check" sub="Deterministic, no LLM involved" accent />
      <Connector />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
        {OUTCOMES.map((o) => (
          <div
            key={o.label}
            className={`rounded-xs border px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] ${SIGNAL_TEXT[o.signal]}`}
          >
            {o.label}
          </div>
        ))}
      </div>
      <Connector />
      <FlowNode label="Execution" sub="Only approved / cleared actions run" />
    </div>
  );
}

function FlowNode({ label, sub, accent = false }) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col justify-center rounded-xs border p-4 ${
        accent ? "border-electric/40 bg-electric/8" : "border-rule bg-paper-hi"
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-[0.08em] ${
          accent ? "text-electric" : "text-graphite"
        }`}
      >
        {label}
      </div>
      <div className="mt-1.5 text-[11px] leading-relaxed text-graphite/70">{sub}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="hidden items-center justify-center px-1 lg:flex">
      <ArrowRight className="h-4 w-4 text-graphite/50" strokeWidth={1.5} />
    </div>
  );
}
