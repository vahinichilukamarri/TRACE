import { ArrowRight } from "lucide-react";

const OUTCOMES = [
  { label: "Approved", signal: "mint" },
  { label: "Blocked", signal: "red" },
  { label: "Flagged for review", signal: "amber" },
];

const SIGNAL_TEXT = {
  mint: "text-signal-mint border-signal-mint/40 bg-signal-mint-dim/10",
  red: "text-signal-red border-signal-red/40 bg-signal-red-dim/10",
  amber: "text-signal-amber border-signal-amber/40 bg-signal-amber-dim/10",
};

export function PolicyControlFlow() {
  return (
    <div className="flex flex-col md:flex-row items-stretch gap-3">
      <FlowNode label="TRACE request" sub="Agent's proposed action + confidence" />
      <Connector />
      <FlowNode label="Policy check" sub="Deterministic, no LLM involved" accent />
      <Connector />
      <div className="flex-1 grid grid-cols-1 gap-2">
        {OUTCOMES.map((o) => (
          <div
            key={o.label}
            className={`border px-3 py-2 text-xs font-mono uppercase tracking-wide text-center ${SIGNAL_TEXT[o.signal]}`}
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
      className={`flex-1 border p-4 flex flex-col justify-center ${
        accent ? "border-signal-orange/40 bg-signal-orange-dim/5" : "border-obsidian-line bg-obsidian-soft"
      }`}
    >
      <div className={`text-xs font-medium uppercase tracking-wide ${accent ? "text-signal-orange" : "text-bone"}`}>
        {label}
      </div>
      <div className="text-[11px] font-mono text-ink-faint mt-1">{sub}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="hidden md:flex items-center justify-center px-1">
      <ArrowRight className="w-4 h-4 text-ink-faint" strokeWidth={1.5} />
    </div>
  );
}
